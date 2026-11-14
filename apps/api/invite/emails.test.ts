// invitation email tests: a topic save's invitations go out one account email each, an accepted one is recorded
// without waiting for the others, and a user invitation goes out as an account email of its target's kind
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { toInvitePath } from "@carlnotes/contracts/seo"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as emails from "@carlnotes/emails/email"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { startInviteEmails, startUserInviteEmail } from "./emails"

// the app url that every invite link starts with, set before each test
const restoreEnvSettings = saveEnvSettings(["BETTER_AUTH_URL"])
beforeEach(() => {
	Bun.env.BETTER_AUTH_URL = "https://carlnotes.test"
})

// put the app url, the connection pool, and the spies back
afterEach(() => {
	restoreEnvSettings()
	restoreConnectionPool()
	mock.restore()
})

// a topic whose owner invites two addresses
const TOPIC = { id: "topic-1", name: "Morning Roasts", ownerId: "user-1" }
const INVITE_EMAILS = ["first@example.com", "second@example.com"]

// the rows that the senders' reads return. the inviter's username, two invites with their tokens, and the name of a
// team or a topic. a write returns no rows
function toInviteQueryRows({ text }: SentQuery): unknown[][] {
	if (text.includes('from "users"')) {
		return [["roaster"]]
	}
	if (text.includes('from "invites"')) {
		return [
			["first@example.com", "token-1"],
			["second@example.com", "token-2"],
		]
	}
	return text.includes('from "teams"') || text.includes('from "topics"') ? [["Morning Roasts"]] : []
}

// the accepted sends that the senders recorded
function toRecordedSends(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter((sentQuery) => sentQuery.text.includes('insert into "topic_email_sends"'))
}

// the queries sent to the stubbed connection pool, and a promise of the first accepted send's record
type InviteQueries = { sentQueries: SentQuery[]; firstRecordedSend: Promise<void> }

// stub the connection pool with the senders' rows
function stubInviteQueries(): InviteQueries {
	const { promise: firstRecordedSend, resolve: markSendRecorded } = Promise.withResolvers<void>()
	const sentQueries = stubConnectionPool((sentQuery) => {
		// the record of an accepted send resolves the promise
		if (toRecordedSends([sentQuery]).length > 0) {
			markSendRecorded()
		}
		return toInviteQueryRows(sentQuery)
	})
	return { sentQueries, firstRecordedSend }
}

// each invitee's email is a send of its own, so one that Resend never accepts leaves the other sent and recorded
test("a topic save's invitations go out one account email each, and only an accepted one is recorded", async () => {
	// the first invitee's email is never accepted, and the second's is
	const { sentQueries, firstRecordedSend } = stubInviteQueries()
	const sendAccountEmailSpy = spyOn(emails, "sendAccountEmail").mockImplementation(
		async (message) => message.to === "second@example.com",
	)

	// start both invitations, and wait for the accepted one's record
	startInviteEmails(TOPIC, INVITE_EMAILS)
	await firstRecordedSend

	// each address got a topic invite with its own invite link, and one send was recorded
	const sentMessages = sendAccountEmailSpy.mock.calls.map(([message]) => message)
	expect(sentMessages.map((message) => [message.emailKind, message.to])).toEqual([
		["topic-invite", "first@example.com"],
		["topic-invite", "second@example.com"],
	])
	expect(sentMessages[0]?.emailContent).toContain(toInvitePath("token-1"))
	expect(sentMessages[1]?.emailContent).toContain(toInvitePath("token-2"))
	expect(toRecordedSends(sentQueries)).toHaveLength(1)
})

// an invitation that is still waiting for another attempt does not hold up the record of one that was accepted
test("a topic save's accepted invitation is recorded while another is still being sent", async () => {
	// the first invitee's send never ends, and the second's is accepted
	const { sentQueries, firstRecordedSend } = stubInviteQueries()
	spyOn(emails, "sendAccountEmail").mockImplementation((message) =>
		message.to === "second@example.com" ? Promise.resolve(true) : new Promise<boolean>(() => {}),
	)

	// the accepted send is recorded
	startInviteEmails(TOPIC, INVITE_EMAILS)
	await firstRecordedSend
	expect(toRecordedSends(sentQueries)).toHaveLength(1)
})

// a user invitation is one account email, a team invite for a team and a recorded topic invite for a topic
test("a user invitation goes out as an account email of its target's kind", async () => {
	// every send is accepted, and the first send ends the wait for the team invitation
	const { sentQueries, firstRecordedSend } = stubInviteQueries()
	const teamInviteSend = Promise.withResolvers<void>()
	const sendAccountEmailSpy = spyOn(emails, "sendAccountEmail").mockImplementation(async () => {
		teamInviteSend.resolve()
		return true
	})

	// one invitation to a team, then one to a topic, which records its accepted send
	startUserInviteEmail({ teamId: "team-1" }, "user-1", "first@example.com", "token-1")
	await teamInviteSend.promise
	startUserInviteEmail({ topicId: "topic-1" }, "user-1", "second@example.com", "token-2")
	await firstRecordedSend
	const sentAccountEmails = sendAccountEmailSpy.mock.calls.map(([message]) => [message.emailKind, message.to])
	expect(sentAccountEmails).toEqual([
		["team-invite", "first@example.com"],
		["topic-invite", "second@example.com"],
	])
	expect(toRecordedSends(sentQueries)).toHaveLength(1)
})
