// the recorded spend: a user's month, one plan's users, or every user since a time, summed from each table that bills
import { type Plan, toCentsFromDollars } from "@carlnotes/contracts/plans"
import { and, eq, gte, inArray, type SQL, sql } from "drizzle-orm"
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core"
import { db } from "./index"
import { startOfUtcMonth } from "./quotas"
import { memoizeInRequest } from "./requestMemo"
import { chatTurns } from "./schema/chat"
import { personalSourcesSummarySpends } from "./schema/personalSources"
import { podcastEpisodes, topicVideos } from "./schema/podcast"
import { scans } from "./schema/scans"
import { spends } from "./schema/spends"
import { topicImageRenders } from "./schema/topicImages"
import { topicPostDiscussions } from "./schema/topicPosts"
import { users } from "./schema/users"

// a recorded spend in dollars, split into scans, chat, and podcast episodes, which include Topic Post Discussions. the
// paid calls with no row of their own are split in two: the ones that bill a user, and the platform's own, which only a
// sum across every user includes
export type RecordedSpend = {
	scanDollars: number
	chatDollars: number
	podcastEpisodeDollars: number
	personalSourcesDollars: number
	topicImageDollars: number
	// the spends table's rows that bill a user, and its rows with no user
	otherDollars: number
	platformDollars: number
}

// a table that bills, the column of the user it bills, and the column of the time it is summed from
type SumCostSinceOptions = { table: PgTable & { cost: AnyPgColumn }; userColumn: AnyPgColumn; timeColumn: AnyPgColumn }

// when the spend to sum starts, the one user whose spend to sum, and the plan whose users to sum without admins.
// every user if both are unset
export type LoadSpendSinceOptions = { since: Date; userId?: string; billedPlan?: Plan }

/**
 * Returns this month's recorded spend for the user, split into scans, chat, and podcast episodes, read at most once per
 * request. A write in the request clears the memo, so a read after a spend row is written sums again.
 */
export function monthlySpendDollars(userId: string): Promise<RecordedSpend> {
	// sum since the start of the UTC month, which the budget resets on, once per request for the user and the month
	const since = startOfUtcMonth(new Date())
	return memoizeInRequest(`monthly-spend:${userId}:${since.toISOString()}`, () => loadSpendSince({ since, userId }))
}

/**
 * Returns the spend recorded since a time for one user, for the users on one plan who are not admins, or for every user,
 * split into scans, chat, podcast episodes, and the rest. Only the sum for every user includes the platform's own
 * spend.
 */
export async function loadSpendSince({ since, userId, billedPlan }: LoadSpendSinceOptions): Promise<RecordedSpend> {
	// filter each sum by the user column it bills, for the one user if one is given, even an empty user id
	const toBilledUserFilter = (billedUserColumn: AnyPgColumn): SQL | undefined =>
		and(
			userId !== undefined ? eq(billedUserColumn, userId) : undefined,
			billedPlan !== undefined ? inArray(billedUserColumn, toPlanUserIdQuery(billedPlan)) : undefined,
		)

	// sum one table's cost since the start time for the users that its user column bills
	const sumCostSince = async ({ table, userColumn, timeColumn }: SumCostSinceOptions): Promise<{ dollars: string }[]> =>
		db
			.select({ dollars: sql<string>`coalesce(sum(${table.cost}), 0)` })
			.from(table)
			.where(and(toBilledUserFilter(userColumn), gte(timeColumn, since)))

	// sum each table's cost since the start time for the billed users
	const [
		[scanSpendRow],
		[chatSpendRow],
		[podcastEpisodeSpendRow],
		[personalSourcesSpendRow],
		[topicImageSpendRow],
		[topicPostDiscussionSpendRow],
		[topicVideoSpendRow],
		[otherSpendRow],
	] = await Promise.all([
		sumCostSince({ table: scans, userColumn: scans.ownerId, timeColumn: scans.startedAt }),
		sumCostSince({ table: chatTurns, userColumn: chatTurns.userId, timeColumn: chatTurns.createdAt }),
		sumCostSince({
			table: podcastEpisodes,
			userColumn: podcastEpisodes.ownerId,
			timeColumn: podcastEpisodes.createdAt,
		}),
		sumCostSince({
			table: personalSourcesSummarySpends,
			userColumn: personalSourcesSummarySpends.userId,
			timeColumn: personalSourcesSummarySpends.createdAt,
		}),
		// the topic image renders bill the user that asked for them
		sumCostSince({
			table: topicImageRenders,
			userColumn: topicImageRenders.userId,
			timeColumn: topicImageRenders.createdAt,
		}),
		// the Topic Post Discussions bill the user that started them
		sumCostSince({
			table: topicPostDiscussions,
			userColumn: topicPostDiscussions.userId,
			timeColumn: topicPostDiscussions.createdAt,
		}),
		// the films bill their podcast episode's owner.
		// ponytail: a rebuild's cost counts in the month the film was made, a cost row per render if that drifts
		db
			.select({ dollars: sql<string>`coalesce(sum(${topicVideos.cost}), 0)` })
			.from(topicVideos)
			.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicVideos.podcastEpisodeId))
			.where(and(toBilledUserFilter(podcastEpisodes.ownerId), gte(topicVideos.createdAt, since))),
		// the paid calls with no row of their own. a row with no user is the platform's, which a user's sum and a plan's
		// sum both leave out, because neither filter matches a null user
		db
			.select({
				userDollars: sql<string>`coalesce(sum(${spends.cost}) filter (where ${spends.userId} is not null), 0)`,
				platformDollars: sql<string>`coalesce(sum(${spends.cost}) filter (where ${spends.userId} is null), 0)`,
			})
			.from(spends)
			.where(and(toBilledUserFilter(spends.userId), gte(spends.createdAt, since))),
	])

	// a discussion is the two hosts recorded, and a film is its podcast episode's, so both count as podcast episode
	// spend
	const podcastEpisodeDollars =
		Number(podcastEpisodeSpendRow?.dollars ?? 0) +
		Number(topicPostDiscussionSpendRow?.dollars ?? 0) +
		Number(topicVideoSpendRow?.dollars ?? 0)
	return {
		scanDollars: Number(scanSpendRow?.dollars ?? 0),
		chatDollars: Number(chatSpendRow?.dollars ?? 0),
		podcastEpisodeDollars,
		personalSourcesDollars: Number(personalSourcesSpendRow?.dollars ?? 0),
		topicImageDollars: Number(topicImageSpendRow?.dollars ?? 0),
		otherDollars: Number(otherSpendRow?.userDollars ?? 0),
		platformDollars: Number(otherSpendRow?.platformDollars ?? 0),
	}
}

/**
 * Returns a subquery of the ids of the users on the plan who are not admins.
 */
export function toPlanUserIdQuery(plan: Plan): SQL {
	return sql`(select ${users.id} from ${users} where ${users.plan} = ${plan} and ${users.role} <> 'admin')`
}

/**
 * Returns a recorded spend in cents, summed across every kind of spend it holds.
 */
export function toSpendCents(recordedSpend: RecordedSpend): number {
	// round each kind's dollars to cents before adding, the way every budget comparison does
	return Object.values(recordedSpend).reduce((spendCents, dollars) => spendCents + toCentsFromDollars(dollars), 0)
}
