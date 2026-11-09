// the topic image reads: a topic's current image and the image urls of many topics at once

import { type TopicImageUrls, toTopicImageUrls } from "@carlnotes/contracts/topicImages"
import { and, eq, gt, inArray } from "drizzle-orm"
import { OPEN_OR_CLEARED_REPORT_FILTER } from "./contentFilters"
import { db } from "./index"
import { reports } from "./schema/reports"
import { topicImages } from "./schema/topicImages"

// a topic's current image row
export type TopicImageRow = typeof topicImages.$inferSelect

/**
 * Returns a topic's current image row, or null for a topic with no image yet.
 */
export async function loadTopicImage(topicId: string): Promise<TopicImageRow | null> {
	const [topicImage] = await db.select().from(topicImages).where(eq(topicImages.topicId, topicId))
	return topicImage ?? null
}

/**
 * Returns a topic's current image row with whether the user reported it: a report of theirs on the image, open or
 * cleared, filed since the image last changed. A reporter no longer sees the image until it changes.
 */
export async function loadTopicImageForUser(
	topicId: string,
	userId: string,
): Promise<{ topicImage: TopicImageRow | null; isReportedByUser: boolean }> {
	// a topic with no image has nothing to report
	const topicImage = await loadTopicImage(topicId)
	if (!topicImage) {
		return { topicImage, isReportedByUser: false }
	}

	// the user's report on this image, if it came after the image's last change
	const [report] = await db
		.select({ id: reports.id })
		.from(reports)
		.where(
			and(
				eq(reports.reporterUserId, userId),
				eq(reports.subjectKind, "topicImage"),
				eq(reports.subjectId, topicId),
				OPEN_OR_CLEARED_REPORT_FILTER,
				gt(reports.createdAt, topicImage.updatedAt),
			),
		)
		.limit(1)
	return { topicImage, isReportedByUser: Boolean(report) }
}

/**
 * Returns each topic's image urls by topic id, leaving out the topics with no image yet.
 */
export async function loadTopicImageUrlsByTopic(topicIds: string[]): Promise<Map<string, TopicImageUrls>> {
	// one read for every topic's hash
	if (topicIds.length === 0) {
		return new Map()
	}

	// map each row's hash to its urls
	const imageRows = await db
		.select({ topicId: topicImages.topicId, hash: topicImages.hash })
		.from(topicImages)
		.where(inArray(topicImages.topicId, topicIds))
	return new Map(imageRows.map((imageRow) => [imageRow.topicId, toTopicImageUrls(imageRow.topicId, imageRow.hash)]))
}
