// a live smoke test that the database unbinds a push device with its session and its account, keeps one push send per
// event, recipient, and phone, and holds each send kind's shape, inside one transaction that is always rolled back.
// run it with: bun run smoke:push-devices. needs Doppler secrets
import { toNormalizedUsername } from "@carlnotes/contracts/usernames"
import { eq } from "drizzle-orm"
import { connectionPool, db } from "./index"
import { chatRoomMessages } from "./schema/chat"
import { pushDevices, pushNotificationSends } from "./schema/pushDevices"
import { scans } from "./schema/scans"
import { teams } from "./schema/teams"
import { topics } from "./schema/topics"
import { sessions, users } from "./schema/users"

// the run's own ids, so a run never touches another row
const runId = `push-devices-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`
const userId = `${runId}-user`
const topicId = `${runId}-topic`
const teamId = `${runId}-team`
const scanId = `${runId}-scan`

// the postgres error codes of a check violation and a unique violation
const CHECK_VIOLATION_CODE = "23514"
const UNIQUE_VIOLATION_CODE = "23505"

// the error that ends the transaction, so nothing the run wrote is kept
class Rollback extends Error {}

// a transaction as drizzle hands it to its callback
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

// log the PASS line if the check holds, and otherwise throw an error that fails the run
function check(label: string, isTestPassing: boolean): void {
	if (!isTestPassing) {
		throw new Error(`FAIL  ${label}`)
	}
	console.log(`PASS  ${label}`)
}

// run one write in its own savepoint, and return the postgres error code it failed with, or null if it was kept
async function tryWrite(
	transaction: Transaction,
	write: (savepoint: Transaction) => Promise<unknown>,
): Promise<string | null> {
	// a savepoint keeps one failed write from aborting the whole transaction
	try {
		await transaction.transaction(async (savepoint) => {
			await write(savepoint)
		})
		return null
	} catch (error) {
		// a failed write returns its postgres error code, read through drizzle's wrapper
		const cause = error instanceof Error && error.cause ? error.cause : error
		return (cause as { code?: string } | null)?.code ?? "unknown"
	}
}

// insert a session and the push device it registered, and return both ids
async function insertPushDevice(
	transaction: Transaction,
	label: string,
): Promise<{ sessionId: string; pushDeviceId: string }> {
	// a live session for the run's user
	const sessionId = `${runId}-${label}-session`
	const pushDeviceId = `${runId}-${label}-device`
	await transaction
		.insert(sessions)
		.values({ id: sessionId, userId, token: `${runId}-${label}-token`, expiresAt: new Date(Date.now() + 60_000) })

	// the phone that the session registered
	await transaction.insert(pushDevices).values({
		id: pushDeviceId,
		expoPushToken: `ExponentPushToken[${runId}-${label}]`,
		userId,
		sessionId,
		platform: "ios",
		appVersion: "0.1.0",
	})
	return { sessionId, pushDeviceId }
}

// whether a push device row still exists
async function hasPushDevice(transaction: Transaction, pushDeviceId: string): Promise<boolean> {
	const pushDeviceRows = await transaction
		.select({ id: pushDevices.id })
		.from(pushDevices)
		.where(eq(pushDevices.id, pushDeviceId))
	return pushDeviceRows.length > 0
}

// try one push send in its own savepoint, returning the postgres error code it failed with, or null if it was kept
function trySend(transaction: Transaction, values: typeof pushNotificationSends.$inferInsert): Promise<string | null> {
	return tryWrite(transaction, (savepoint) => savepoint.insert(pushNotificationSends).values(values))
}

// the run user's push sends, with the phone each one names
function loadSendRows(transaction: Transaction): Promise<{ pushDeviceId: string | null }[]> {
	return transaction
		.select({ pushDeviceId: pushNotificationSends.pushDeviceId })
		.from(pushNotificationSends)
		.where(eq(pushNotificationSends.recipientUserId, userId))
}

// seed the user, the Topic, the Team, the Scan, and a room message, then check the cascades, the sends, and the shapes
async function checkPushDevices(transaction: Transaction): Promise<void> {
	// the user, and their Topic with a Scan
	await transaction.insert(users).values({
		id: userId,
		name: "push",
		email: `${runId}@carlnotes.test`,
		username: runId,
		usernameNormalized: toNormalizedUsername(runId),
	})
	await transaction.insert(topics).values({ id: topicId, ownerId: userId, name: "push devices smoke topic" })
	await transaction.insert(scans).values({ id: scanId, topicId, ownerId: userId })

	// the Team and one message in its own room
	await transaction.insert(teams).values({ id: teamId, name: runId })
	const [roomMessageRow] = await transaction
		.insert(chatRoomMessages)
		.values({ teamId, authorUserId: userId, authorUsername: runId, content: "encrypted" })
		.returning({ id: chatRoomMessages.id })
	const roomMessageId = roomMessageRow?.id ?? 0

	// ending a session deletes the push device that it registered, and leaves the account's other phones
	const signedOut = await insertPushDevice(transaction, "signed-out")
	const kept = await insertPushDevice(transaction, "kept")
	await transaction.delete(sessions).where(eq(sessions.id, signedOut.sessionId))
	check("ending a session deletes its push device", !(await hasPushDevice(transaction, signedOut.pushDeviceId)))
	check("ending a session keeps the account's other phones", await hasPushDevice(transaction, kept.pushDeviceId))

	// a send of each kind is kept
	const pushDeviceId = kept.pushDeviceId
	const scanSend = { kind: "topic-scan", scanId, recipientUserId: userId, pushDeviceId, ticketId: "a" } as const
	const mentionSend = {
		kind: "chat-mention",
		roomMessageId,
		recipientUserId: userId,
		pushDeviceId,
		ticketId: "b",
	} as const
	check("a topic-scan send is kept", (await trySend(transaction, scanSend)) === null)
	check("a chat-mention send is kept", (await trySend(transaction, mentionSend)) === null)

	// a second send for the same event, recipient, and phone breaks the unique index
	const repeatedScanErrorCode = await trySend(transaction, { ...scanSend, ticketId: "c" })
	const repeatedMentionErrorCode = await trySend(transaction, { ...mentionSend, ticketId: "d" })
	check("a repeated Scan send is rejected", repeatedScanErrorCode === UNIQUE_VIOLATION_CODE)
	check("a repeated mention send is rejected", repeatedMentionErrorCode === UNIQUE_VIOLATION_CODE)

	// a send whose event does not match its kind fails the shape check
	const scanlessErrorCode = await trySend(transaction, { ...scanSend, scanId: null, ticketId: "e" })
	const mismatchedErrorCode = await trySend(transaction, { ...mentionSend, scanId, ticketId: "f" })
	check(`a topic-scan send with no Scan is rejected (${scanlessErrorCode})`, scanlessErrorCode === CHECK_VIOLATION_CODE)
	check(
		`a chat-mention send with a Scan is rejected (${mismatchedErrorCode})`,
		mismatchedErrorCode === CHECK_VIOLATION_CODE,
	)

	// retiring the phone keeps its sends with no phone
	await transaction.delete(pushDevices).where(eq(pushDevices.id, pushDeviceId))
	const retiredSendRows = await loadSendRows(transaction)
	const isEverySendUnbound = retiredSendRows.every((sendRow) => sendRow.pushDeviceId === null)
	check("retiring a phone keeps its sends with no phone", retiredSendRows.length === 2 && isEverySendUnbound)

	// closing the account deletes every phone and send
	const closed = await insertPushDevice(transaction, "closed")
	await transaction.delete(users).where(eq(users.id, userId))
	check("closing the account deletes its push devices", !(await hasPushDevice(transaction, closed.pushDeviceId)))
	check("closing the account deletes its push sends", (await loadSendRows(transaction)).length === 0)
}

// run every check in one transaction that always rolls back, so the run leaves nothing behind
console.log(`\n=== push devices smoke (run ${runId}) ===`)
let exitCode = 0
try {
	await db.transaction(async (transaction) => {
		await checkPushDevices(transaction)
		throw new Rollback()
	})
} catch (error) {
	// the rollback signal is the passing run's own end, and any other error fails the run
	if (error instanceof Rollback) {
		console.log("\n=== smoke PASSED ===")
	} else {
		console.error(error)
		exitCode = 1
	}
}

// close the connection pool so the process exits on its own, then report the outcome as the exit code
await connectionPool.end()
process.exitCode = exitCode
