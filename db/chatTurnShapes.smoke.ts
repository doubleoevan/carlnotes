// a live smoke test that the database holds each chat turn kind's shape and each chat proposal's, by inserting a
// valid row of every kind and every mismatched shape inside one transaction that is always rolled back.
// run it with: bun run smoke:chat-turns. needs Doppler secrets
import { toNormalizedUsername } from "@shared/usernames"
import { connectionPool, db } from "./index"
import { chatProposals, chatTurns } from "./schema/chat"
import { podcastEpisodes } from "./schema/podcast"
import { teams } from "./schema/teams"
import { topics } from "./schema/topics"
import { users } from "./schema/users"

// the run's own ids, so a run never touches another row
const runId = `chat-turn-shapes-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`
const userId = `${runId}-user`
const topicId = `${runId}-topic`
const teamId = `${runId}-team`
const podcastEpisodeId = `${runId}-episode`

// the postgres error code of a check violation
const CHECK_VIOLATION_CODE = "23514"

// the error that ends the transaction, so nothing the run wrote is kept
class Rollback extends Error {}

// a transaction as drizzle hands it to its callback
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

// one insert to try, with its label and the write it makes
type ShapeInsert = { label: string; insert: (transaction: Transaction) => Promise<unknown> }

// log the PASS line if the check holds, and otherwise throw an error that fails the run
function check(label: string, isTestPassing: boolean): void {
	if (!isTestPassing) {
		throw new Error(`FAIL  ${label}`)
	}
	console.log(`PASS  ${label}`)
}

// the postgres error code of a failed insert, read through drizzle's wrapper
function toErrorCode(error: unknown): string | undefined {
	const cause = error instanceof Error && error.cause ? error.cause : error
	return (cause as { code?: string } | null)?.code
}

// run one insert in its own savepoint, and return the postgres error code it failed with, or null if it was kept
async function tryInsert(transaction: Transaction, { insert }: ShapeInsert): Promise<string | null> {
	// a savepoint keeps one failed insert from aborting the whole transaction
	try {
		await transaction.transaction(async (savepoint) => {
			await insert(savepoint)
		})
		return null
	} catch (error) {
		// a failed insert returns its postgres error code
		return toErrorCode(error) ?? "unknown"
	}
}

// the inserts to try: the ones that must be kept, and the ones a check must reject
type ShapeInserts = { validInserts: ShapeInsert[]; mismatchedInserts: ShapeInsert[] }

// try every insert in its own savepoint
async function checkShapeInserts(
	transaction: Transaction,
	{ validInserts, mismatchedInserts }: ShapeInserts,
): Promise<void> {
	// every valid insert is kept, and every mismatched insert fails its check
	for (const validInsert of validInserts) {
		check(`${validInsert.label} is kept`, (await tryInsert(transaction, validInsert)) === null)
	}
	for (const mismatchedInsert of mismatchedInserts) {
		const errorCode = await tryInsert(transaction, mismatchedInsert)
		check(`${mismatchedInsert.label} is rejected by a check (${errorCode})`, errorCode === CHECK_VIOLATION_CODE)
	}
}

// one chat turn row to try, with its label and its columns
type ChatTurnShape = { label: string; values: typeof chatTurns.$inferInsert }

// the rows of every kind that match their shape
const validChatTurnShapes: ChatTurnShape[] = [
	{ label: "a private row", values: { kind: "private", userId, topicId, question: "q", answer: "a" } },
	{
		label: "a podcast row",
		values: { kind: "podcast", userId, topicId, podcastEpisodeId, chapterPosition: 0, podcastAnswerSpeaker: "cohost" },
	},
	{ label: "a chat room row", values: { kind: "chat_room", userId, topicId, roomMessageId: 1 } },
	{ label: "a transcription row", values: { kind: "transcription", userId, topicId } },
	{ label: "a speech row", values: { kind: "speech", userId, teamId } },
]

// the rows whose columns do not match their kind, each of which a check must reject
const mismatchedChatTurnShapes: ChatTurnShape[] = [
	{
		label: "a podcast row with no podcast episode",
		values: { kind: "podcast", userId, topicId, chapterPosition: 0, podcastAnswerSpeaker: "host" },
	},
	{
		label: "a private row with a chat room message id",
		values: { kind: "private", userId, topicId, roomMessageId: 2 },
	},
	{ label: "a speech row with a question", values: { kind: "speech", userId, topicId, question: "q" } },
	{ label: "a chat room row with text", values: { kind: "chat_room", userId, topicId, roomMessageId: 3, answer: "a" } },
	{
		label: "a podcast row on a team",
		values: { kind: "podcast", userId, teamId, podcastEpisodeId, chapterPosition: 0, podcastAnswerSpeaker: "host" },
	},
]

// the insert that tries one chat turn row
function toChatTurnInsert({ label, values }: ChatTurnShape): ShapeInsert {
	return { label, insert: (transaction) => transaction.insert(chatTurns).values(values) }
}

// seed the user, the topic, the team, and the podcast episode the rows name, then try every insert
async function checkChatTurnShapes(transaction: Transaction): Promise<void> {
	// the user who asks
	await transaction.insert(users).values({
		id: userId,
		name: "shapes",
		email: `${runId}@carlnotes.test`,
		username: runId,
		usernameNormalized: toNormalizedUsername(runId),
	})

	// the topic, the team, and the published podcast episode the rows name
	await transaction.insert(topics).values({ id: topicId, ownerId: userId, name: "chat turn shapes smoke topic" })
	await transaction.insert(teams).values({ id: teamId, name: runId })
	await transaction
		.insert(podcastEpisodes)
		.values({ id: podcastEpisodeId, topicId, ownerId: userId, status: "published" })

	// every valid row is kept, and every mismatched row fails its check
	await checkShapeInserts(transaction, {
		validInserts: validChatTurnShapes.map(toChatTurnInsert),
		mismatchedInserts: mismatchedChatTurnShapes.map(toChatTurnInsert),
	})

	// a chat proposal names the chat turn that showed it
	const [chatTurnRow] = await transaction
		.insert(chatTurns)
		.values({ kind: "chat_room", userId, topicId, roomMessageId: 4 })
		.returning({ id: chatTurns.id })
	const chatTurnId = chatTurnRow?.id ?? ""

	// a private proposal with a digest and a chat room proposal with its topic edit are kept, and a chat room proposal
	// with a digest or with no topic fails its check
	const validChatProposalShapes: ChatProposalShape[] = [
		{ label: "a private proposal with a digest", values: { chatTurnId, topicId, digest: "d" } },
		{ label: "a chat room proposal with its topic edit", values: { chatTurnId, topicId, teamId, topicEdit: "p" } },
	]
	const mismatchedChatProposalShapes: ChatProposalShape[] = [
		{ label: "a chat room proposal with a digest", values: { chatTurnId, topicId, teamId, digest: "d" } },
		{ label: "a chat room proposal with no topic", values: { chatTurnId, teamId, topicEdit: "p" } },
	]
	await checkShapeInserts(transaction, {
		validInserts: validChatProposalShapes.map(toChatProposalInsert),
		mismatchedInserts: mismatchedChatProposalShapes.map(toChatProposalInsert),
	})
}

// one chat proposal row to try, with its label and its columns besides the run's user
type ChatProposalShape = { label: string; values: Omit<typeof chatProposals.$inferInsert, "userId"> }

// the insert that tries one chat proposal row for the run's user
function toChatProposalInsert({ label, values }: ChatProposalShape): ShapeInsert {
	return { label, insert: (savepoint) => savepoint.insert(chatProposals).values({ userId, ...values }) }
}

// run every check in one transaction that always rolls back, so the run leaves nothing behind
console.log(`\n=== chat turn shapes smoke (run ${runId}) ===`)
let exitCode = 0
try {
	await db.transaction(async (transaction) => {
		await checkChatTurnShapes(transaction)
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
