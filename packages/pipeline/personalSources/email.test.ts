// synthetic mail exercises the real activity's security gates and retry transitions without network calls
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as confirmations from "@carlnotes/db/personalSourcesEmailConfirmations"
import * as allowance from "@carlnotes/db/personalSourcesQuota"
import * as receiving from "@carlnotes/db/personalSourcesSend"
import * as replies from "@carlnotes/emails/personalSourcesEmail"
import * as analytics from "@carlnotes/server/analytics"
import { FIXTURE_EMAIL_ID, personalSourcesEmailFixture } from "@carlnotes/server/personalSourcesEmailTestFixtures"
import * as provider from "@carlnotes/server/resendInbound"
import { processPersonalSourcesEmail } from "./email"
import { restorePersonalSourcesEmail, setReply, stubPersonalSourcesEmail } from "./emailTestFixtures"
import * as routing from "./emailTopic"
import * as work from "./work"

// Each test receives the account installed in its provider and database stubs.
let destination: confirmations.AccountEmailDestination
beforeEach(() => {
	// direct filing fixtures name their Topic in the subject
	destination = stubPersonalSourcesEmail()
	spyOn(provider, "fetchReceivedPersonalSourcesEmail").mockResolvedValue({
		status: "received",
		email: personalSourcesEmailFixture({ subject: "topic: Coffee" }),
	})
})
afterEach(restorePersonalSourcesEmail)

test("a subject-directed request saves once to every matching Topic and sends confirmation", async () => {
	expect(await processPersonalSourcesEmail("confirmation")).toEqual({ retryAfterMs: null })
	expect(spyOn(receiving, "receivePersonalSourcesSend")).toHaveBeenCalledTimes(1)
	expect(spyOn(receiving, "receivePersonalSourcesSend").mock.calls[0]?.[0]).toMatchObject({
		userId: "owner",
		topicIds: ["topic", "second"],
		origin: "email",
		requestId: FIXTURE_EMAIL_ID,
	})
	expect(spyOn(work, "notifyPersonalSourcesChanged")).toHaveBeenCalledTimes(2)
	expect(spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[0]?.[0].reply.kind).toBe("filed")
})

test("a filed email reports one entry for each Topic, with none of its text", async () => {
	const trackEventSpy = spyOn(analytics, "trackEvent")
	await processPersonalSourcesEmail("confirmation")
	expect(trackEventSpy.mock.calls).toEqual([
		[
			"personal_source_entry_received",
			"owner",
			{ entryPoint: "email", plan: "premium", origin: "email", entryCount: 2 },
		],
	])
})

test("a filed email that reaches one Topic names it", async () => {
	const trackEventSpy = spyOn(analytics, "trackEvent")
	spyOn(receiving, "receivePersonalSourcesSend").mockResolvedValue({
		status: "accepted",
		entryId: "entry",
		title: "Coffee",
		queuedLinkCount: 1,
		topic: { id: "topic", name: "Coffee", url: "https://carlnotes.com/topics/topic" },
	})
	await processPersonalSourcesEmail("confirmation")
	expect(trackEventSpy.mock.calls).toEqual([
		[
			"personal_source_entry_received",
			"owner",
			{ entryPoint: "email", plan: "premium", origin: "email", topicId: "topic", entryCount: 1 },
		],
	])
})

test("an email that was not filed reports why, and a spent allowance reports the limit too", async () => {
	const trackEventSpy = spyOn(analytics, "trackEvent")
	const properties = { entryPoint: "email", plan: "premium", origin: "email" }
	spyOn(receiving, "receivePersonalSourcesSend").mockResolvedValue({ status: "quota", resetAt: "2026-11-05T00:00:00Z" })
	await processPersonalSourcesEmail("confirmation")
	expect(trackEventSpy.mock.calls).toEqual([
		["personal_sources_email_unfiled", "owner", { ...properties, reason: "quota" }],
		["personal_sources_quota_reached", "owner", properties],
	])

	// a Free account reports the plan
	trackEventSpy.mockClear()
	destination.confirmation.outcome = null
	destination.owner.plan = "free"
	await processPersonalSourcesEmail("confirmation")
	expect(trackEventSpy.mock.calls).toEqual([
		["personal_sources_email_unfiled", "owner", { ...properties, plan: "free", reason: "plan" }],
	])
})

const refusedEmails: NonNullable<Parameters<typeof personalSourcesEmailFixture>[0]>[] = [
	{ to: ["another@inbox.carlnotes.com"] },
	{ from: "stranger@example.com" },
	{ authentication: null },
	{ authentication: { spf: "pass", dkim: "gray", dmarc: "pass" } },
	{ authentication: { spf: "pass", dkim: "pass", dmarc: "gray" } },
	{
		authentication: { spf: "pass", dkim: "fail", dmarc: "fail" },
		headers: { "Authentication-Results": "dkim=pass; dmarc=pass" },
	},
	{ headers: { "Auto-Submitted": "auto-replied" } },
	{ headers: { "Content-Type": "multipart/report; report-type=delivery-status" } },
]
test.each(refusedEmails)(
	"untrusted or automatic mail is dropped before matching, filing, or replies: %j",
	async (overrides) => {
		spyOn(provider, "fetchReceivedPersonalSourcesEmail").mockResolvedValue({
			status: "received",
			email: personalSourcesEmailFixture(overrides),
		})
		await processPersonalSourcesEmail("confirmation")
		expect(spyOn(routing, "resolvePersonalSourcesEmailTopics")).not.toHaveBeenCalled()
		expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
		expect(spyOn(replies, "sendPersonalSourcesEmailReply")).not.toHaveBeenCalled()
	},
)

test("unresolved mail requests Topic names without filing or notifying summarization", async () => {
	spyOn(routing, "resolvePersonalSourcesEmailTopics").mockResolvedValue({ topicIds: [], suggestions: [] })
	await processPersonalSourcesEmail("confirmation")
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
	expect(spyOn(work, "notifyPersonalSourcesChanged")).not.toHaveBeenCalled()
	expect(spyOn(replies, "sendPersonalSourcesEmailReply")).toHaveBeenCalledWith(
		expect.objectContaining({
			confirmationId: "confirmation",
			to: "owner@example.com",
			reply: expect.objectContaining({ kind: "needs_topic" }),
		}),
	)
})

test("Reply-To cannot redirect an authenticated filing confirmation", async () => {
	spyOn(provider, "fetchReceivedPersonalSourcesEmail").mockResolvedValue({
		status: "received",
		email: personalSourcesEmailFixture({ headers: { "Reply-To": "attacker@example.org" } }),
	})
	await processPersonalSourcesEmail("confirmation")
	expect(spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[0]?.[0].to).toBe("owner@example.com")
})

test("a pending reply retries the original snapshot without fetching or filing again", async () => {
	const trackEventSpy = spyOn(analytics, "trackEvent")
	setReply(
		destination,
		{
			kind: "filed",
			topics: [
				{ name: "Original Topic", url: "https://carlnotes.com/topics/topic", entryId: "entry" },
				{ name: "Second Topic", url: "https://carlnotes.com/topics/second", entryId: "entry-second" },
			],
		},
		"entry",
	)
	spyOn(replies, "sendPersonalSourcesEmailReply").mockResolvedValueOnce({
		outcome: "retryable",
		failure: { httpStatus: 503, resendError: "busy" },
		retryAfterSeconds: null,
	})
	expect(await processPersonalSourcesEmail("confirmation")).toEqual({ retryAfterMs: 30_000 })
	await processPersonalSourcesEmail("confirmation")
	expect(spyOn(provider, "fetchReceivedPersonalSourcesEmail")).not.toHaveBeenCalled()
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
	expect(spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[0]?.[0]).toEqual(
		spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[1]?.[0],
	)

	// the email was reported when it was filed, so a retried reply reports nothing
	expect(trackEventSpy).not.toHaveBeenCalled()
})

test("deleted snapshots, changed accounts, and expired idempotency windows never send", async () => {
	setReply(destination, { kind: "needs_topic" })
	destination.confirmation.replyStartedAt = new Date(Date.now() - 24 * 60 * 60_000)
	await processPersonalSourcesEmail("confirmation")
	// a deleted reply snapshot and a deleted destination send nothing either
	destination.reply = null
	await processPersonalSourcesEmail("confirmation")
	spyOn(confirmations, "loadPersonalSourcesEmailDestination").mockResolvedValue(null)
	await processPersonalSourcesEmail("confirmation")
	expect(spyOn(replies, "sendPersonalSourcesEmailReply")).not.toHaveBeenCalled()
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
})

test("Plus mail saves matching content and sends confirmation", async () => {
	// exercise the activity's entitlement gate as well as the locked database capability check
	destination.owner.plan = "plus"
	await processPersonalSourcesEmail("confirmation")
	expect(spyOn(routing, "resolvePersonalSourcesEmailTopics")).toHaveBeenCalledTimes(1)
	expect(spyOn(receiving, "receivePersonalSourcesSend")).toHaveBeenCalledTimes(1)
	expect(spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[0]?.[0].reply.kind).toBe("filed")
})

test("authenticated mail without an account gets one same-thread sign-in reply and never runs matching", async () => {
	// simulate both provider attempts against one durable unregistered delivery
	const trackVisitorEventSpy = spyOn(analytics, "trackVisitorEvent")
	const sender = "new@example.org"
	const confirmation = {
		...destination.confirmation,
		userId: null,
		outcome: "account_required" as const,
		senderDigest: confirmations.toPersonalSourcesSenderDigest(sender),
		replyStartedAt: new Date(),
	}
	spyOn(confirmations, "loadPersonalSourcesEmailDestination").mockResolvedValue({
		owner: null,
		confirmation,
		reply: null,
	})
	spyOn(provider, "fetchReceivedPersonalSourcesEmail").mockResolvedValue({
		status: "received",
		email: personalSourcesEmailFixture({
			from: sender,
			message_id: "<mail@example.org>",
			headers: { "Reply-To": "other@example.org" },
		}),
	})
	const sendReply = spyOn(replies, "sendPersonalSourcesEmailReply").mockResolvedValueOnce({
		outcome: "retryable",
		failure: { httpStatus: 503, resendError: "busy" },
		retryAfterSeconds: 1,
	})
	await processPersonalSourcesEmail("confirmation")
	await processPersonalSourcesEmail("confirmation")
	expect(sendReply.mock.calls[0]?.[0]).toMatchObject({
		confirmationId: "confirmation",
		to: sender,
		reply: { kind: "not_filed", reason: "account", subject: "Re: Coffee", inReplyTo: "<mail@example.org>" },
	})
	expect(sendReply.mock.calls[1]).toEqual(sendReply.mock.calls[0])

	// the sender has no account, so the delivered reply reports one shared visitor event
	expect(trackVisitorEventSpy.mock.calls).toEqual([["personal_sources_email_unregistered", { entryPoint: "email" }]])
	expect(spyOn(routing, "resolvePersonalSourcesEmailTopics")).not.toHaveBeenCalled()
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
})

test("mismatched From, failed authentication, other recipients and acknowledgments cannot trigger account guidance", async () => {
	const confirmation = {
		...destination.confirmation,
		userId: null,
		outcome: "account_required" as const,
		replyStartedAt: new Date(),
	}
	spyOn(confirmations, "loadPersonalSourcesEmailDestination").mockResolvedValue({
		owner: null,
		confirmation,
		reply: null,
	})
	for (const overrides of [
		...refusedEmails,
		{
			text: "Thanks\nOn Monday, Carl wrote:\n> https://example.org/digest",
			headers: { "In-Reply-To": "<digest@resend.dev>" },
		},
	]) {
		spyOn(provider, "fetchReceivedPersonalSourcesEmail").mockResolvedValue({
			status: "received",
			email: personalSourcesEmailFixture(overrides),
		})
		await processPersonalSourcesEmail("confirmation")
	}
	expect(spyOn(replies, "sendPersonalSourcesEmailReply")).not.toHaveBeenCalled()
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
})

test("quota refusals and Free eligibility replies save no content", async () => {
	spyOn(receiving, "receivePersonalSourcesSend").mockResolvedValue({ status: "quota", resetAt: "2026-11-05T00:00:00Z" })
	await processPersonalSourcesEmail("confirmation")
	expect(spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[0]?.[0].reply).toMatchObject({
		kind: "not_filed",
		reason: "quota",
	})
	destination.confirmation.outcome = null
	destination.owner.plan = "free"
	await processPersonalSourcesEmail("confirmation")
	expect(spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[1]?.[0].reply).toMatchObject({
		kind: "not_filed",
		reason: "plan",
	})
})

test("temporary provider failures retry without storing mail or sending a reply", async () => {
	spyOn(provider, "fetchReceivedPersonalSourcesEmail").mockResolvedValue({ status: "retry" })
	expect(await processPersonalSourcesEmail("confirmation")).toEqual({ retryAfterMs: 30_000 })
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
	expect(spyOn(replies, "sendPersonalSourcesEmailReply")).not.toHaveBeenCalled()
})

test("deleting a non-first destination suppresses a pending multi-Topic reply", async () => {
	setReply(
		destination,
		{
			kind: "filed",
			topics: [
				{ name: "Coffee", url: "https://carlnotes.com/topics/topic", entryId: "entry" },
				{ name: "Roasting", url: "https://carlnotes.com/topics/second", entryId: "deleted-second" },
			],
		},
		"entry",
	)
	stubConnectionPool(() => [["entry"]])
	await processPersonalSourcesEmail("confirmation")
	expect(spyOn(replies, "sendPersonalSourcesEmailReply")).not.toHaveBeenCalled()
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
	expect(spyOn(confirmations, "finishPersonalSourcesEmailConfirmation")).toHaveBeenCalledWith({
		confirmationId: "confirmation",
		state: "refused",
	})
})

test("matching outages retry without partial storage or a no-match reply", async () => {
	spyOn(routing, "resolvePersonalSourcesEmailTopics").mockRejectedValue(new Error("Model unavailable"))
	expect(await processPersonalSourcesEmail("confirmation")).toEqual({ retryAfterMs: 30_000 })
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
	expect(spyOn(replies, "sendPersonalSourcesEmailReply")).not.toHaveBeenCalled()
})

for (const text of ["Thanks", "Thanks\nOn Monday, Carl wrote:\n> https://example.org/digest"]) {
	test(`a linkless reply cannot match, file, consume allowance, or receive another reply: ${text}`, async () => {
		spyOn(provider, "fetchReceivedPersonalSourcesEmail").mockResolvedValue({
			status: "received",
			email: personalSourcesEmailFixture({ text, headers: { "In-Reply-To": "<digest@resend.dev>" } }),
		})
		expect(await processPersonalSourcesEmail("confirmation")).toEqual({ retryAfterMs: null })
		expect(spyOn(routing, "resolvePersonalSourcesEmailTopics")).not.toHaveBeenCalled()
		expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
		expect(spyOn(replies, "sendPersonalSourcesEmailReply")).not.toHaveBeenCalled()
	})
}

for (const original of ["digest", "filing", "clarification", "other-carl-email"]) {
	test(`a reply to ${original} with a new link saves only the new content`, async () => {
		spyOn(provider, "fetchReceivedPersonalSourcesEmail").mockResolvedValue({
			status: "received",
			email: personalSourcesEmailFixture({
				subject: "Re: topic: Coffee",
				text: "Also consider https://example.org/new\nOn Monday, Carl wrote:\n> https://example.org/old",
				headers: { References: `<${original}@resend.dev>` },
			}),
		})
		await processPersonalSourcesEmail("confirmation")
		expect(spyOn(receiving, "receivePersonalSourcesSend").mock.calls[0]?.[0]).toMatchObject({
			topicIds: ["topic", "second"],
			payload: { text: "Also consider https://example.org/new", links: ["https://example.org/new"] },
		})
		expect(spyOn(replies, "sendPersonalSourcesEmailReply")).toHaveBeenCalledTimes(1)
	})
}

test("a full daily budget sends a quota reply before matching or storing choices", async () => {
	spyOn(allowance, "readPersonalSourcesAllowance").mockResolvedValue({
		isAvailable: false,
		day: "2026-11-04",
		now: new Date("2026-11-04T14:00:00Z"),
		resetAt: "2026-11-05T00:00:00Z",
	})
	const saveChoices = spyOn(confirmations, "savePersonalSourcesEmailChoices").mockResolvedValue()
	await processPersonalSourcesEmail("confirmation")
	expect(spyOn(routing, "resolvePersonalSourcesEmailTopics")).not.toHaveBeenCalled()
	expect(saveChoices).not.toHaveBeenCalled()
	expect(spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[0]?.[0].reply).toMatchObject({
		kind: "not_filed",
		reason: "quota",
	})
})

test("a new email with text alone still reaches matching", async () => {
	spyOn(provider, "fetchReceivedPersonalSourcesEmail").mockResolvedValue({
		status: "received",
		email: personalSourcesEmailFixture({ subject: "topic: Coffee", text: "Try a finer grind." }),
	})
	await processPersonalSourcesEmail("confirmation")
	expect(spyOn(receiving, "receivePersonalSourcesSend")).toHaveBeenCalledTimes(1)
})
