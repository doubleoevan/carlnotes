// a live smoke test for the profile's two subscriber numbers, which are different.
// run it with: bun run smoke:profile. needs Doppler secrets
import { and, eq, sum } from "drizzle-orm"
import { connectionPool, db } from "../db"
import { subscriptions, topics, users } from "../db/schema"
import { countDistinctSubscribers } from "./profiles"
import { updateTopicSubscriberCount } from "./topic/subscriberCounts"

// the transaction each test case runs inside, so that no fixture ever escapes it
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

// the rollback marker, which is how the fixtures are cleaned up instead of by deleting them
class Rollback extends Error {}

// what one test case produced, as the profile would show it
type Counts = { header: number; footer: number }

/**
 * Build an owner with three public topics, run a test case, then clean up its data.
 */
async function withOwner(runCase: (fixture: Fixture, transaction: DbTransaction) => Promise<void>): Promise<Counts> {
	let counts: Counts = { header: -1, footer: -1 }
	try {
		await db.transaction(async (transaction) => {
			// an owner and two other people, sharing one run id so a parallel run does not collide on an id
			const runId = `smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`
			const people = await transaction
				.insert(users)
				.values(
					["owner", "subscriber", "other"].map((role) => ({
						id: `${runId}-${role}`,
						name: role,
						email: `${runId}-${role}@carlnotes.test`,
						username: `${runId}-${role}`,
						usernameNormalized: `${runId}${role}`.toLowerCase(),
					})),
				)
				.returning()

			// three public topics, to test one person spread subscribing to several of them
			const created = await transaction
				.insert(topics)
				.values(
					[0, 1, 2].map((position) => ({
						id: `${runId}-topic-${position}`,
						ownerId: people[0]?.id ?? "",
						name: `topic ${position}`,
						visibility: "public" as const,
					})),
				)
				.returning()

			// the people and topics one test case uses
			const fixture = {
				ownerId: people[0]?.id ?? "",
				subscriberId: people[1]?.id ?? "",
				otherId: people[2]?.id ?? "",
				topicIds: created.map((topic) => topic.id),
			}
			await runCase(fixture, transaction)

			// recount subscribers for every topic, then read the two numbers the profile shows
			for (const topicId of fixture.topicIds) {
				await updateTopicSubscriberCount(topicId, transaction)
			}
			counts = await toProfileCounts(fixture.ownerId, transaction)
			throw new Rollback()
		})
	} catch (error) {
		// only a real failure propagates. the rollback is the cleanup
		if (!(error instanceof Rollback)) {
			throw error
		}
	}
	return counts
}

// the owner, their subscribers, and their topics
type Fixture = { ownerId: string; subscriberId: string; otherId: string; topicIds: string[] }

// the header's distinct subscribers and the footer's summed topic subscribers, as the profile shows them
async function toProfileCounts(ownerId: string, transaction: DbTransaction): Promise<Counts> {
	const [summedSubscribers] = await transaction
		.select({ total: sum(topics.subscriberCount) })
		.from(topics)
		.where(and(eq(topics.ownerId, ownerId), eq(topics.visibility, "public")))
	// the header asks who, the footer adds up rows. they are meant to differ
	return {
		header: await countDistinctSubscribers(ownerId, transaction),
		footer: Number(summedSubscribers?.total ?? 0),
	}
}

// subscribe to more than one of the owner's topics as one person
async function subscribe(transaction: DbTransaction, topicIds: string[], subscriberId: string): Promise<void> {
	await transaction
		.insert(subscriptions)
		.values(topicIds.map((topicId) => ({ topicId, subscriberUserId: subscriberId })))
}

// each case: what it checks, and the header and footer numbers it should produce
const cases: [string, Counts, (fixture: Fixture, transaction: DbTransaction) => Promise<void>][] = [
	[
		"one person following three topics is 1 in the header and 3 in the footer",
		{ header: 1, footer: 3 },
		async (fixture, transaction) => subscribe(transaction, fixture.topicIds, fixture.subscriberId),
	],
	[
		"two people following every topic is 2 in the header and 6 in the footer",
		{ header: 2, footer: 6 },
		async (fixture, transaction) => {
			await subscribe(transaction, fixture.topicIds, fixture.subscriberId)
			await subscribe(transaction, fixture.topicIds, fixture.otherId)
		},
	],
	[
		"one person following one topic agrees at 1 and 1",
		{ header: 1, footer: 1 },
		async (fixture, transaction) => subscribe(transaction, fixture.topicIds.slice(0, 1), fixture.subscriberId),
	],
	[
		"the owner following their own three topics counts nowhere",
		{ header: 0, footer: 0 },
		async (fixture, transaction) => subscribe(transaction, fixture.topicIds, fixture.ownerId),
	],
]

// run every test case and report, exiting non-zero if either number comes back wrong
console.log("\n=== profile subscriber count smoke ===")
let allPassed = true
for (const [label, expected, runCase] of cases) {
	const actual = await withOwner(runCase)
	const isPassed = actual.header === expected.header && actual.footer === expected.footer
	allPassed &&= isPassed
	const wanted = `header ${expected.header}, footer ${expected.footer}`
	console.log(
		`${isPassed ? "PASS" : "FAIL"}  ${label} — expected ${wanted}, got header ${actual.header}, footer ${actual.footer}`,
	)
}
// close the connection pool so the process exits on its own, then report the outcome as the exit code
await connectionPool.end()
process.exit(allPassed ? 0 : 1)
