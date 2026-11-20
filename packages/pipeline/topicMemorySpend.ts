// one topic memory update's running spend, which its Scan row takes once a stage instead of once a model call. the
// backfill's spend is the platform's, and goes to the spends table instead
import { db } from "@carlnotes/db"
import { scans } from "@carlnotes/db/schema/scans"
import { recordSpend } from "@carlnotes/db/spends"
import { eq, sql } from "drizzle-orm"

// the Scan that the spend is recorded on, the most the update may spend, what its model calls have cost so far, and
// how much of that cost is already recorded. an update that the platform pays for names its Topic, and its spend is
// recorded as the platform's instead of on the Scan
export type TopicMemorySpend = {
	scanId: string
	limitDollars: number
	spentDollars: number
	savedDollars: number
	platformBilledTopicId?: string
}

/**
 * Starts an update's spend at nothing, under the most the update may spend. A Topic given is the Topic of an update
 * that the platform pays for.
 */
export function newTopicMemorySpend(
	scanId: string,
	limitDollars: number,
	platformBilledTopicId?: string,
): TopicMemorySpend {
	return { scanId, limitDollars, spentDollars: 0, savedDollars: 0, platformBilledTopicId }
}

/**
 * Adds one model call's cost to the update's running total. A call outside an update keeps no total.
 */
export function chargeTopicMemorySpend(spend: TopicMemorySpend | undefined, dollars: number): void {
	if (spend && dollars > 0) {
		spend.spentDollars += dollars
	}
}

/**
 * Returns whether the update may start another model call, which it may while its total is below its limit.
 */
export function canSpendOnTopicMemories(spend: TopicMemorySpend | undefined): boolean {
	return !spend || spend.spentDollars < spend.limitDollars
}

/**
 * Adds what the update has spent since its last save to the Scan's cost and to its topic memory stage cost. The
 * platform's spend is recorded as a row of its own, dated now, so it reaches the day's total and never the Scan's
 * owner's month.
 */
export async function saveTopicMemorySpend(spend: TopicMemorySpend): Promise<void> {
	const unsavedDollars = spend.spentDollars - spend.savedDollars
	if (unsavedDollars <= 0) {
		return
	}

	// count the amount as saved before the write, so a second save that starts meanwhile never writes it again
	spend.savedDollars += unsavedDollars
	const amount = unsavedDollars.toFixed(6)
	try {
		// the platform's spend never touches the Scan's cost, which the owner's month sums
		if (spend.platformBilledTopicId) {
			const topicId = spend.platformBilledTopicId
			await recordSpend({ kind: "topicMemoryBackfill", dollars: unsavedDollars, topicId })
			return
		}
		await db
			.update(scans)
			.set({
				cost: sql`${scans.cost} + ${amount}::numeric`,
				stageCosts: sql`jsonb_set(${scans.stageCosts}, '{topicMemories}',
				to_jsonb(coalesce((${scans.stageCosts}->>'topicMemories')::numeric, 0) + ${amount}::numeric))`,
			})
			.where(eq(scans.id, spend.scanId))
	} catch (error) {
		// a failed write leaves the amount for the next save
		spend.savedDollars -= unsavedDollars
		throw error
	}
}
