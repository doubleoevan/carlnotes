// Each email test controls one isolated, synthetic account and delivery.
import { mock, spyOn } from "bun:test"
import type { PersonalSourcesEmailReply } from "@carlnotes/contracts/personalSourcesEmail"
import * as claims from "@carlnotes/db/claim"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import * as receipts from "@carlnotes/db/personalSourcesEmailReceipts"
import * as allowance from "@carlnotes/db/personalSourcesQuota"
import * as receiving from "@carlnotes/db/personalSourcesSend"
import * as limiter from "@carlnotes/db/resendRateLimit"
import { personalSourcesEmailReceipts } from "@carlnotes/db/schema/personalSources"
import * as replies from "@carlnotes/emails/personalSourcesEmail"
import { FIXTURE_EMAIL_ID, personalSourcesEmailFixture } from "@carlnotes/server/personalSourcesEmailTestFixtures"
import { encryptPrivateText } from "@carlnotes/server/privateText"
import * as provider from "@carlnotes/server/resendInbound"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import * as routing from "./emailTopic"
import * as work from "./work"

type Destination = receipts.AccountEmailDestination
const restoreEnvSettings = saveEnvSettings(["BETTER_AUTH_SECRET", "CHAT_TEXT_KEY", "RESEND_FROM_EMAIL"])

/** Installs the account, storage, and provider stubs for one synthetic delivery. */
export function stubPersonalSourcesEmail(): Destination {
	// fixture identity and encryption remain local, with no live account or provider content
	Bun.env.RESEND_FROM_EMAIL = "Carl <carl@example.com>"
	Bun.env.BETTER_AUTH_SECRET = "fixture-auth-secret"
	Bun.env.CHAT_TEXT_KEY = Buffer.alloc(32, 9).toString("base64")
	const destination = {
		receipt: {
			id: "receipt",
			emailId: FIXTURE_EMAIL_ID,
			userId: "owner",
			senderDigest: receipts.toPersonalSourcesSenderDigest("owner@example.com"),
			state: "processing",
			outcome: null,
		},
		owner: { id: "owner", email: "owner@example.com", plan: "premium", role: "user" },
		reply: null,
	} as Destination
	stubConnectionPool(({ text }) =>
		text.includes('from "personal_source_email_receipts"')
			? [toTableRow(personalSourcesEmailReceipts, destination.receipt)]
			: text.includes('from "personal_source_entries"')
				? [["entry"], ["entry-second"]]
				: [["entry"]],
	)
	spyOn(claims, "runWithClaim").mockImplementation(async ({ runTask }) => runTask(new AbortController().signal))
	spyOn(receipts, "loadPersonalSourcesEmailDestination").mockImplementation(async () => destination)
	spyOn(receipts, "isPersonalSourcesEmailSenderCurrent").mockResolvedValue(true)
	spyOn(receipts, "startPersonalSourcesEmailAttempt").mockResolvedValue(1)
	spyOn(allowance, "readPersonalSourcesAllowance").mockResolvedValue({
		isAvailable: true,
		day: "2026-11-04",
		now: new Date("2026-11-04T14:00:00Z"),
		resetAt: "2026-11-05T00:00:00Z",
	})
	spyOn(receipts, "finishPersonalSourcesEmailReceipt").mockResolvedValue()
	spyOn(receipts, "retryPersonalSourcesEmailReceipt").mockResolvedValue(30_000)
	spyOn(receipts, "savePersonalSourcesEmailReply").mockImplementation(async (_transaction, _id, reply, entryId) => {
		setReply(destination, reply, entryId)
	})
	spyOn(limiter, "waitForResendSlot").mockResolvedValue()
	spyOn(provider, "fetchReceivedPersonalSourcesEmail").mockResolvedValue({
		status: "received",
		email: personalSourcesEmailFixture(),
	})
	spyOn(routing, "resolvePersonalSourcesEmailTopics").mockResolvedValue({
		topicIds: ["topic", "second"],
		suggestions: [],
	})
	spyOn(receiving, "receivePersonalSourcesSend").mockResolvedValue({
		status: "accepted",
		entryId: "entry",
		title: "Coffee",
		queuedLinkCount: 1,
		topic: { id: "topic", name: "Coffee", url: "https://carlnotes.com/topics/topic" },
		receipts: [
			{
				topic: { id: "topic", name: "Coffee", url: "https://carlnotes.com/topics/topic" },
				entryId: "entry",
				queuedLinkCount: 1,
			},
			{
				topic: { id: "second", name: "Roasting", url: "https://carlnotes.com/topics/second" },
				entryId: "entry-second",
				queuedLinkCount: 1,
			},
		],
	})
	spyOn(replies, "sendPersonalSourcesEmailReply").mockResolvedValue({ outcome: "accepted" })
	spyOn(work, "notifyPersonalSourcesChanged").mockResolvedValue()
	return destination
}

/** Restores the providers, connection pool, and settings after each delivery. */
export function restorePersonalSourcesEmail(): void {
	mock.restore()
	restoreConnectionPool()
	restoreEnvSettings()
}

/** Simulates the durable reply snapshot without persisting test content. */
export function setReply(
	destination: Destination,
	reply: PersonalSourcesEmailReply,
	entryId: string | null = null,
): void {
	destination.receipt.outcome = reply.kind
	destination.receipt.replyStartedAt = new Date()
	destination.reply = {
		receiptId: "receipt",
		userId: "owner",
		entryId,
		encryptedPayload: encryptPrivateText(JSON.stringify(reply)),
	}
}
