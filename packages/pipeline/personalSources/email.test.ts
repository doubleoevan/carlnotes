// synthetic mail exercises the real activity's security gates and retry transitions without network calls
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as receipts from "@carlnotes/db/personalSourcesEmailReceipts"
import * as allowance from "@carlnotes/db/personalSourcesQuota"
import * as receiving from "@carlnotes/db/personalSourcesSend"
import * as replies from "@carlnotes/emails/personalSourcesEmail"
import { FIXTURE_EMAIL_ID, personalSourcesEmailFixture } from "@carlnotes/server/personalSourcesEmailTestFixtures"
import * as provider from "@carlnotes/server/resendInbound"
import { processPersonalSourcesEmail } from "./email"
import { restorePersonalSourcesEmail, setReply, stubPersonalSourcesEmail } from "./emailTestFixtures"
import * as routing from "./emailTopic"
import * as work from "./work"

// Each test receives the account installed in its provider and database stubs.
let destination: receipts.AccountEmailDestination
beforeEach(() => {
	destination = stubPersonalSourcesEmail()
})
afterEach(restorePersonalSourcesEmail)

test("a clear request saves once to every matching Topic and sends confirmation", async () => {
	expect(await processPersonalSourcesEmail("receipt")).toEqual({ retryAfterMs: null })
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
		await processPersonalSourcesEmail("receipt")
		expect(spyOn(routing, "resolvePersonalSourcesEmailTopics")).not.toHaveBeenCalled()
		expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
		expect(spyOn(replies, "sendPersonalSourcesEmailReply")).not.toHaveBeenCalled()
	},
)

test("unresolved mail requests Topic names without filing or notifying summarization", async () => {
	spyOn(routing, "resolvePersonalSourcesEmailTopics").mockResolvedValue({ topicIds: [], suggestions: [] })
	await processPersonalSourcesEmail("receipt")
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
	expect(spyOn(work, "notifyPersonalSourcesChanged")).not.toHaveBeenCalled()
	expect(spyOn(replies, "sendPersonalSourcesEmailReply")).toHaveBeenCalledWith(
		expect.objectContaining({
			receiptId: "receipt",
			to: "owner@example.com",
			reply: expect.objectContaining({ kind: "needs_topic" }),
		}),
	)
})

test("Reply-To cannot redirect an authenticated filing receipt", async () => {
	spyOn(provider, "fetchReceivedPersonalSourcesEmail").mockResolvedValue({
		status: "received",
		email: personalSourcesEmailFixture({ headers: { "Reply-To": "attacker@example.org" } }),
	})
	await processPersonalSourcesEmail("receipt")
	expect(spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[0]?.[0].to).toBe("owner@example.com")
})

test("a pending reply retries the original snapshot without fetching or filing again", async () => {
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
	expect(await processPersonalSourcesEmail("receipt")).toEqual({ retryAfterMs: 30_000 })
	await processPersonalSourcesEmail("receipt")
	expect(spyOn(provider, "fetchReceivedPersonalSourcesEmail")).not.toHaveBeenCalled()
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
	expect(spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[0]?.[0]).toEqual(
		spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[1]?.[0],
	)
})

test("deleted snapshots, changed accounts, and expired idempotency windows never send", async () => {
	setReply(destination, { kind: "needs_topic" })
	destination.receipt.replyStartedAt = new Date(Date.now() - 24 * 60 * 60_000)
	await processPersonalSourcesEmail("receipt")
	destination.reply = null
	await processPersonalSourcesEmail("receipt")
	spyOn(receipts, "loadPersonalSourcesEmailDestination").mockResolvedValue(null)
	await processPersonalSourcesEmail("receipt")
	expect(spyOn(replies, "sendPersonalSourcesEmailReply")).not.toHaveBeenCalled()
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
})

test("Plus mail saves matching content and sends confirmation", async () => {
	// exercise the activity's entitlement gate as well as the locked database capability check
	destination.owner.plan = "plus"
	await processPersonalSourcesEmail("receipt")
	expect(spyOn(routing, "resolvePersonalSourcesEmailTopics")).toHaveBeenCalledTimes(1)
	expect(spyOn(receiving, "receivePersonalSourcesSend")).toHaveBeenCalledTimes(1)
	expect(spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[0]?.[0].reply.kind).toBe("filed")
})

test("authenticated mail without an account gets one same-thread sign-in reply and never runs matching", async () => {
	// simulate both provider attempts against one durable unregistered delivery
	const sender = "new@example.org"
	const receipt = {
		...destination.receipt,
		userId: null,
		outcome: "account_required" as const,
		senderDigest: receipts.toPersonalSourcesSenderDigest(sender),
		replyStartedAt: new Date(),
	}
	spyOn(receipts, "loadPersonalSourcesEmailDestination").mockResolvedValue({ owner: null, receipt, reply: null })
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
	await processPersonalSourcesEmail("receipt")
	await processPersonalSourcesEmail("receipt")
	expect(sendReply.mock.calls[0]?.[0]).toMatchObject({
		receiptId: "receipt",
		to: sender,
		reply: { kind: "not_filed", reason: "account", subject: "Re: Coffee", inReplyTo: "<mail@example.org>" },
	})
	expect(sendReply.mock.calls[1]).toEqual(sendReply.mock.calls[0])
	expect(spyOn(routing, "resolvePersonalSourcesEmailTopics")).not.toHaveBeenCalled()
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
})

test("mismatched From, failed authentication, other recipients and acknowledgments cannot trigger account guidance", async () => {
	const receipt = {
		...destination.receipt,
		userId: null,
		outcome: "account_required" as const,
		replyStartedAt: new Date(),
	}
	spyOn(receipts, "loadPersonalSourcesEmailDestination").mockResolvedValue({ owner: null, receipt, reply: null })
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
		await processPersonalSourcesEmail("receipt")
	}
	expect(spyOn(replies, "sendPersonalSourcesEmailReply")).not.toHaveBeenCalled()
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
})

test("quota refusals and Free eligibility replies save no content", async () => {
	spyOn(receiving, "receivePersonalSourcesSend").mockResolvedValue({ status: "quota", resetAt: "2026-11-05T00:00:00Z" })
	await processPersonalSourcesEmail("receipt")
	expect(spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[0]?.[0].reply).toMatchObject({
		kind: "not_filed",
		reason: "quota",
	})
	destination.receipt.outcome = null
	destination.owner.plan = "free"
	await processPersonalSourcesEmail("receipt")
	expect(spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[1]?.[0].reply).toMatchObject({
		kind: "not_filed",
		reason: "plan",
	})
})

test("temporary provider failures retry without storing mail or sending a reply", async () => {
	spyOn(provider, "fetchReceivedPersonalSourcesEmail").mockResolvedValue({ status: "retry" })
	expect(await processPersonalSourcesEmail("receipt")).toEqual({ retryAfterMs: 30_000 })
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
	await processPersonalSourcesEmail("receipt")
	expect(spyOn(replies, "sendPersonalSourcesEmailReply")).not.toHaveBeenCalled()
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
	expect(spyOn(receipts, "finishPersonalSourcesEmailReceipt")).toHaveBeenCalledWith({
		receiptId: "receipt",
		state: "refused",
	})
})

test("matching outages retry without partial storage or a no-match reply", async () => {
	spyOn(routing, "resolvePersonalSourcesEmailTopics").mockRejectedValue(new Error("Model unavailable"))
	expect(await processPersonalSourcesEmail("receipt")).toEqual({ retryAfterMs: 30_000 })
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
	expect(spyOn(replies, "sendPersonalSourcesEmailReply")).not.toHaveBeenCalled()
})

for (const text of ["Thanks", "Thanks\nOn Monday, Carl wrote:\n> https://example.org/digest"]) {
	test(`a linkless reply cannot match, file, consume allowance, or receive another reply: ${text}`, async () => {
		spyOn(provider, "fetchReceivedPersonalSourcesEmail").mockResolvedValue({
			status: "received",
			email: personalSourcesEmailFixture({ text, headers: { "In-Reply-To": "<digest@resend.dev>" } }),
		})
		expect(await processPersonalSourcesEmail("receipt")).toEqual({ retryAfterMs: null })
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
				subject: "Re: Carl's email",
				text: "Also consider https://example.org/new\nOn Monday, Carl wrote:\n> https://example.org/old",
				headers: { References: `<${original}@resend.dev>` },
			}),
		})
		await processPersonalSourcesEmail("receipt")
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
	const saveChoices = spyOn(receipts, "savePersonalSourcesEmailChoices").mockResolvedValue()
	await processPersonalSourcesEmail("receipt")
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
		email: personalSourcesEmailFixture({ subject: "Fwd: Coffee notes", text: "topic: Coffee\nTry a finer grind." }),
	})
	await processPersonalSourcesEmail("receipt")
	expect(spyOn(receiving, "receivePersonalSourcesSend")).toHaveBeenCalledTimes(1)
})
