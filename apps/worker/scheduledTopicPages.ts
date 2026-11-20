// the scheduled Topics' ids read once in sweep order, the Topic whose last completed Scan is oldest first, and the
// Topics of one page of those ids

import { db } from "@carlnotes/db"
import { topics } from "@carlnotes/db/schema/topics"
import { asc, inArray, sql } from "drizzle-orm"
import { toLastCompletedScans, toScheduledTopicFilter } from "./scheduledTopicFilter"
import type { Topic } from "./scheduledTopicScans"

/**
 * Returns the ids of the Topics scheduled for a Scan now, in one read. A Topic that never completed a Scan comes
 * first, then the Topic whose last completed Scan is oldest, with a Topic's id to order a tie, so a sweep that cannot
 * start every Topic leaves the ones that scanned most recently.
 */
export async function loadScheduledTopicIds(now: Date): Promise<string[]> {
	// the scheduled Topics' ids over each Topic's last completed Scan, oldest last completed Scan first
	const lastCompletedScans = toLastCompletedScans()
	const topicRows = await db
		.select({ topicId: topics.id })
		.from(topics)
		.leftJoinLateral(lastCompletedScans, sql`true`)
		.where(toScheduledTopicFilter(now, lastCompletedScans.startedAt))
		.orderBy(sql`${lastCompletedScans.startedAt} asc nulls first`, asc(topics.id))

	// the ids alone, in that order
	return topicRows.map((topicRow) => topicRow.topicId)
}

/**
 * Returns the Topics of one page of scheduled Topic ids, in the order of the ids. A Topic deleted since its id was
 * read is left out.
 */
export async function loadScheduledTopics(topicIds: string[]): Promise<Topic[]> {
	// an empty page reads nothing
	if (topicIds.length === 0) {
		return []
	}

	// read the page's Topics, then put them back in the order of the ids
	const topicRows = await db.select().from(topics).where(inArray(topics.id, topicIds))
	const topicById = new Map(topicRows.map((topic) => [topic.id, topic]))
	return topicIds.flatMap((topicId) => topicById.get(topicId) ?? [])
}
