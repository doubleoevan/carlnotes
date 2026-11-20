// the write of a paid call that no other row records. a row with a user bills that user's month, and a row with no user
// is the platform's own cost, which only the day's total across every user reads

import { db } from "./index"
import { type SpendKind, spends } from "./schema/spends"

// what the call paid for, its cost, the user it bills, or none for the platform, and the Topic and the podcast episode
// it was made for, if it had one
export type RecordSpendOptions = {
	kind: SpendKind
	dollars: number
	userId?: string | null
	topicId?: string | null
	podcastEpisodeId?: string | null
}

/**
 * Records a paid call's cost at the time it was incurred. A cost of zero records nothing.
 */
export async function recordSpend({
	kind,
	dollars,
	userId = null,
	topicId = null,
	podcastEpisodeId = null,
}: RecordSpendOptions): Promise<void> {
	if (dollars > 0) {
		await db.insert(spends).values({ kind, cost: dollars, userId, topicId, podcastEpisodeId })
	}
}
