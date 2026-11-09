// topic image backfill activities: the listing, the render row for one topic, and the resize pass. they run in the
// worker process, not the sandbox

import { db } from "@carlnotes/db"
import { topicImageRenders, topicImages } from "@carlnotes/db/schema/topicImages"
import { topics } from "@carlnotes/db/schema/topics"
import { topicImageModel } from "@carlnotes/models/topicImageModel"
import type { TopicImageBackfillMode } from "@carlnotes/pipeline/temporalClient"
import { and, asc, eq, isNull, sql } from "drizzle-orm"
import type { RenderTopicImageWorkflowInput } from "./renderTopicImage"
import { rederiveTopicImageFiles } from "./renderTopicImageActivities"

// the backfill's mode
export type ListBackfillTopicIdsOptions = {
	mode: TopicImageBackfillMode
	afterTopic?: BackfillTopicCursor
	limit: number
}

// where a page of the listing ends: the last topic's place in the public-first, oldest-first order, with its time as
// the database wrote it
export type BackfillTopicCursor = { publicRank: 0 | 1; createdAt: string; id: string }

// one page of the topics to backfill, and the cursor of the next page, or null on the last page
export type BackfillTopicPage = { topicIds: string[]; nextCursor: BackfillTopicCursor | null }

/**
 * Lists the topics the mode names, public topics first and then by creation: the topics with no image for missing,
 * the topics with a generated image for redo, and every topic with an image for resize.
 */
export async function listBackfillTopicIds({
	mode,
	afterTopic,
	limit,
}: ListBackfillTopicIdsOptions): Promise<BackfillTopicPage> {
	// the mode's filter over the topic and its image row
	const modeFilter =
		mode === "missing"
			? isNull(topicImages.topicId)
			: mode === "redo"
				? eq(topicImages.origin, "generated")
				: sql`${topicImages.topicId} is not null`

	// public topics first, oldest first within each, then by id, which the cursor compares as one row
	const publicRank = sql`case when ${topics.visibility} = 'public' then 0 else 1 end`
	const cursorFilter = afterTopic
		? sql`(${publicRank}, ${topics.createdAt}, ${topics.id}) > (${afterTopic.publicRank}, ${afterTopic.createdAt}::timestamptz, ${afterTopic.id})`
		: undefined

	// one page of the listing, with each row's time as text
	const topicRows = await db
		.select({ id: topics.id, createdAt: sql<string>`${topics.createdAt}::text`, visibility: topics.visibility })
		.from(topics)
		.leftJoin(topicImages, eq(topicImages.topicId, topics.id))
		.where(and(modeFilter, cursorFilter))
		.orderBy(asc(publicRank), asc(topics.createdAt), asc(topics.id))
		.limit(limit)

	// a full page may have more after it
	const lastTopic = topicRows.length === limit ? topicRows[topicRows.length - 1] : undefined

	// the page's ids, and the cursor the next page starts after
	return {
		topicIds: topicRows.map((topicRow) => topicRow.id),
		nextCursor: lastTopic
			? {
					publicRank: lastTopic.visibility === "public" ? 0 : 1,
					createdAt: lastTopic.createdAt,
					id: lastTopic.id,
				}
			: null,
	}
}

// the topic to render
export type StartBackfillRenderOptions = { topicId: string }

/**
 * Writes a backfill render row for the topic on the platform key, reusing a pending one, and returns the child's input.
 */
export async function startBackfillRender({
	topicId,
}: StartBackfillRenderOptions): Promise<RenderTopicImageWorkflowInput> {
	// a pending backfill row from an earlier attempt is this topic's render
	const [pendingRender] = await db
		.select({ id: topicImageRenders.id })
		.from(topicImageRenders)
		.where(
			and(
				eq(topicImageRenders.topicId, topicId),
				eq(topicImageRenders.kind, "backfill"),
				eq(topicImageRenders.status, "pending"),
			),
		)
	if (pendingRender) {
		return { topicId, renderId: pendingRender.id }
	}

	// a new row with no user, on the platform's budget
	const [renderRow] = await db
		.insert(topicImageRenders)
		.values({ topicId, userId: null, kind: "backfill", model: topicImageModel() })
		.returning({ id: topicImageRenders.id })

	// the child workflow is named by the row
	if (!renderRow) {
		throw new Error(`no backfill render row was written for topic ${topicId}`)
	}
	return { topicId, renderId: renderRow.id }
}

/**
 * Derives a topic's files again from its stored original, and records the pass as a resize render row.
 */
export async function rederiveBackfillTopicImageFiles(topicId: string): Promise<void> {
	await rederiveTopicImageFiles(topicId)
	await db
		.insert(topicImageRenders)
		.values({ topicId, userId: null, kind: "resize", status: "succeeded", finishedAt: new Date() })
}
