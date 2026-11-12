// the order both backfills list Topics in, and the cursor that pages through it: public Topics first, then the oldest,
// then by id. the listings run in the worker process, not the sandbox

import { topics } from "@carlnotes/db/schema/topics"
import { asc, type SQL, sql } from "drizzle-orm"

// where a page of a Topics listing ends: the last Topic's place in the public-first, oldest-first order, with its time
// as the database wrote it
export type BackfillTopicCursor = { publicRank: 0 | 1; createdAt: string; id: string }

// a Topic's place in the public-first order: 0 for a public Topic, 1 for any other
export const topicPublicRank = sql<number>`case when ${topics.visibility} = 'public' then 0 else 1 end`

// public Topics first, oldest first within each, then by id, which the cursor compares as one row
export const BACKFILL_TOPIC_ORDER = [asc(topicPublicRank), asc(topics.createdAt), asc(topics.id)]

/**
 * Returns the filter of the Topics after a cursor in the listing's order, or undefined on the first page.
 */
export function toAfterTopicFilter(afterTopic: BackfillTopicCursor | undefined): SQL | undefined {
	return afterTopic
		? sql`(${topicPublicRank}, ${topics.createdAt}, ${topics.id}) > (${afterTopic.publicRank}, ${afterTopic.createdAt}::timestamptz, ${afterTopic.id})`
		: undefined
}

// a listed Topic: its id, its time as text, and its visibility
type ListedTopic = { id: string; createdAt: string; visibility: string }

/**
 * Returns the cursor of the page after a listing's last Topic.
 */
export function toBackfillTopicCursor({ id, createdAt, visibility }: ListedTopic): BackfillTopicCursor {
	return { publicRank: visibility === "public" ? 0 : 1, createdAt, id }
}
