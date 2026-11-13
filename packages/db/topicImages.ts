// the topic image reads: a topic's current image, the image urls of many topics at once, and the reports that hide an
// image from its reporter

import { type TopicImageUrls, toTopicImageUrls, toTopicPostImageUrls } from "@carlnotes/contracts/topicImages"
import { and, eq, gt, inArray, like } from "drizzle-orm"
import { OPEN_OR_CLEARED_REPORT_FILTER } from "./contentFilters"
import { db } from "./index"
import { reports } from "./schema/reports"
import { topicImages } from "./schema/topicImages"
import { topicPosts } from "./schema/topicPosts"

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
	const isReportedByUser = await isImageReportedByUser({
		userId,
		subjectKind: "topicImage",
		subjectId: topicId,
		changedAt: topicImage.updatedAt,
	})
	return { topicImage, isReportedByUser }
}

// an image's report read: the reporter, the image's kind and subject, and when the image last changed, or null for an
// image with no recorded change
type IsImageReportedByUserOptions = {
	userId: string
	subjectKind: "topicImage" | "topicPostImage"
	subjectId: string
	changedAt: Date | null
}

/**
 * Returns whether the user reported an image since it last changed: a report of theirs, open or cleared.
 */
export async function isImageReportedByUser({
	userId,
	subjectKind,
	subjectId,
	changedAt,
}: IsImageReportedByUserOptions): Promise<boolean> {
	const [report] = await db
		.select({ id: reports.id })
		.from(reports)
		.where(
			and(
				eq(reports.reporterUserId, userId),
				eq(reports.subjectKind, subjectKind),
				eq(reports.subjectId, subjectId),
				OPEN_OR_CLEARED_REPORT_FILTER,
				changedAt ? gt(reports.createdAt, changedAt) : undefined,
			),
		)
		.limit(1)
	return Boolean(report)
}

/**
 * Returns the ids of the images in a Topic Post's body that an admin removed on a report, by Remove or Block.
 */
export async function loadRemovedTopicPostBodyImageIds(topicPostId: string): Promise<string[]> {
	const reportRows = await db
		.selectDistinct({ subjectId: reports.subjectId })
		.from(reports)
		.where(
			and(
				eq(reports.subjectKind, "topicPostBodyImage"),
				like(reports.subjectId, `${topicPostId}/%`),
				inArray(reports.resolution, ["removed", "blocked"]),
			),
		)
	return reportRows.map((reportRow) => reportRow.subjectId.slice(topicPostId.length + 1))
}

/**
 * Returns the ids of the images in a Topic Post's body that the user reported, open or cleared. A body image never
 * changes under its id, so every report of one counts.
 */
export async function loadReportedTopicPostBodyImageIds(userId: string, topicPostId: string): Promise<string[]> {
	const reportRows = await db
		.select({ subjectId: reports.subjectId })
		.from(reports)
		.where(
			and(
				eq(reports.reporterUserId, userId),
				eq(reports.subjectKind, "topicPostBodyImage"),
				like(reports.subjectId, `${topicPostId}/%`),
				OPEN_OR_CLEARED_REPORT_FILTER,
			),
		)
	return reportRows.map((reportRow) => reportRow.subjectId.slice(topicPostId.length + 1))
}

/**
 * Returns each Topic Post's image urls by post id, or null for a post with no image, leaving out the posts that are
 * gone.
 */
export async function loadTopicPostImageUrlsByPost(
	topicPostIds: string[],
): Promise<Map<string, TopicImageUrls | null>> {
	if (topicPostIds.length === 0) {
		return new Map()
	}

	// map each post's hash to its urls
	const topicPostRows = await db
		.select({ id: topicPosts.id, imageHash: topicPosts.imageHash })
		.from(topicPosts)
		.where(inArray(topicPosts.id, topicPostIds))
	return new Map(
		topicPostRows.map((topicPostRow) => [
			topicPostRow.id,
			topicPostRow.imageHash ? toTopicPostImageUrls(topicPostRow.id, topicPostRow.imageHash) : null,
		]),
	)
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
