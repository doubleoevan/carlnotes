// a live smoke test for the denormalized subscriber count
// run it with: bun run smoke:subscribers. needs Doppler secrets
import { eq } from "drizzle-orm"
import { connectionPool, db } from "../../db"
import { subscriptions, topics, users } from "../../db/schema"
import { updateTopicSubscriberCount } from "./subscriberCounts"

// the transaction each case runs inside, so no fixture ever escapes it
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

// the rollback marker, which is how the fixtures are cleaned up instead of by deleting them
class Rollback extends Error {}

// build an owner, a topic, and three other people, run one case against them, then undo all of it
async function withFixtures(
	runCase: (fixture: Fixture, transaction: DbTransaction) => Promise<number>,
): Promise<number> {
	let storedCount = -1
	try {
		await db.transaction(async (transaction) => {
			// four people sharing one stamp, so a parallel run never collides on an id
			const stamp = `smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`
			const people = await transaction
				.insert(users)
				.values(
					// one row per role the cases need, each with the name columns the users table requires
					["owner", "direct", "member", "both"].map((role) => ({
						id: `${stamp}-${role}`,
						name: role,
						email: `${stamp}-${role}@carlnotes.test`,
						username: `${stamp}-${role}`,
						usernameNormalized: `${stamp}${role}`.replaceAll("-", "").toLowerCase(),
					})),
				)
				.returning()
			// the topic the count is about, owned by the first of them
			const [topic] = await transaction
				.insert(topics)
				.values({ id: `${stamp}-topic`, ownerId: people[0]?.id ?? "", name: "counted topic" })
				.returning()
			// the case sets its rows up and hands back what the recount stored
			storedCount = await runCase(
				{ topicId: topic?.id ?? "", owner: people[0], direct: people[1], member: people[2], both: people[3] },
				transaction,
			)
			throw new Rollback()
		})
	} catch (error) {
		// only a real failure propagates. the rollback is the cleanup
		if (!(error instanceof Rollback)) {
			throw error
		}
	}
	return storedCount
}

// the people and the topic one case is handed
type Fixture = {
	topicId: string
	owner: typeof users.$inferSelect | undefined
	direct: typeof users.$inferSelect | undefined
	member: typeof users.$inferSelect | undefined
	both: typeof users.$inferSelect | undefined
}

// recount, then read back what a profile or feed would read
async function toStoredCount(topicId: string, transaction: DbTransaction): Promise<number> {
	await updateTopicSubscriberCount(topicId, transaction)
	const [row] = await transaction.select({ count: topics.subscriberCount }).from(topics).where(eq(topics.id, topicId))
	return row?.count ?? -1
}

// each case: what it checks, and the count it should produce
const cases: [string, number, (fixture: Fixture, transaction: DbTransaction) => Promise<number>][] = [
	[
		"a direct subscriber counts once",
		1,
		async (fixture, transaction) => {
			await transaction
				.insert(subscriptions)
				.values({ topicId: fixture.topicId, subscriberUserId: fixture.direct?.id ?? "" })
			return toStoredCount(fixture.topicId, transaction)
		},
	],
	[
		"the owner's own subscription never counts",
		0,
		async (fixture, transaction) => {
			await transaction
				.insert(subscriptions)
				.values({ topicId: fixture.topicId, subscriberUserId: fixture.owner?.id ?? "" })
			return toStoredCount(fixture.topicId, transaction)
		},
	],
	[
		"a second subscriber counts alongside the first",
		2,
		async (fixture, transaction) => {
			await transaction
				.insert(subscriptions)
				.values({ topicId: fixture.topicId, subscriberUserId: fixture.direct?.id ?? "" })
			await transaction
				.insert(subscriptions)
				.values({ topicId: fixture.topicId, subscriberUserId: fixture.member?.id ?? "" })
			return toStoredCount(fixture.topicId, transaction)
		},
	],
	[
		"an unsubscribed row stops counting",
		0,
		async (fixture, transaction) => {
			await transaction
				.insert(subscriptions)
				.values({ topicId: fixture.topicId, subscriberUserId: fixture.direct?.id ?? "", isActive: false })
			return toStoredCount(fixture.topicId, transaction)
		},
	],
]

// run every case and report, exiting non-zero if any count came back wrong
console.log("\n=== subscriber count smoke ===")
let allPassed = true
for (const [label, expected, runCase] of cases) {
	const actual = await withFixtures(runCase)
	const isPassed = actual === expected
	allPassed &&= isPassed
	console.log(`${isPassed ? "PASS" : "FAIL"}  ${label} — expected ${expected}, got ${actual}`)
}
// close the pool so the process exits on its own, then report the outcome as the exit code
await connectionPool.end()
process.exit(allPassed ? 0 : 1)
