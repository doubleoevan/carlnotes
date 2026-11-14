// the admin console's reports: the open list, and resolving one by removing its content, clearing it, or putting an
// admin block on its author
import { toAvatarKeyVersion, toAvatarVersion } from "@carlnotes/contracts/avatars"
import type { ReportedSubjectQuery } from "@carlnotes/contracts/payloads"
import {
	type AdminReport,
	REMOVABLE_REPORT_SUBJECT_KINDS,
	type ReportResolution,
	type ReportSubjectKind,
} from "@carlnotes/contracts/reports"
import {
	type TopicImageUrls,
	toPodcastEpisodeImageUrls,
	toTopicPodcastEpisodeVideoPosterUrl,
} from "@carlnotes/contracts/topicImages"
import {
	fromTopicPostBodyImagePath,
	toTopicPostBodyImageIds,
	toTopicPostBodyImagePath,
} from "@carlnotes/contracts/topicPostBodyImages"
import { db } from "@carlnotes/db"
import { chatRoomMessages } from "@carlnotes/db/schema/chat"
import { noteComments, notes } from "@carlnotes/db/schema/notes"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { reports } from "@carlnotes/db/schema/reports"
import { comments } from "@carlnotes/db/schema/social"
import { teams } from "@carlnotes/db/schema/teams"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { loadTopicImageUrlsByTopic, loadTopicPostImageUrlsByPost } from "@carlnotes/db/topicImages"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import type { Context } from "hono"
import { setAdminBlock } from "../adminBlocks"
import { publishedAvatarColumns, toPublishedAvatarFromUser } from "../avatars"
import { toSignedTopicPostBodyImageUrl } from "../topicPost/topicPostBodyImages"
import { removeReportedSubject, removeReportedSubjectImages } from "./removeReportedSubject"
import { toReportTextHash } from "./reports"

// the reporter and the author, each joined to the report from the users table
const reporters = alias(users, "reporters")
const authors = alias(users, "authors")

// the avatar or the images of a reported profile, team, or podcast episode: a published avatar's version, or a podcast
// episode's own image with its film's poster
type ReportedSubjectImages = Partial<
	Pick<AdminReport, "subjectImage" | "subjectAvatarVersion" | "topicPodcastEpisodeVideoPosterUrl">
>

/**
 * Counts the open reports.
 */
export async function countOpenReports(): Promise<number> {
	return db.$count(reports, isNull(reports.resolvedAt))
}

/**
 * Loads the open reports newest first, each with its subject's avatar or images as they stand, whether Remove has
 * something to take down, and whether its subject is already deleted.
 */
export async function loadOpenReports(): Promise<AdminReport[]> {
	// the open rows with both people's usernames
	const reportRows = await loadOpenReportRows()

	// which removable subjects still exist, the reported images as they stand, and the avatars and podcast episode
	// images that Remove alone takes down, read per kind in one query each
	const [existingSubjectKeys, topicImageUrlsByTopic, topicPostImageUrlsByPost, subjectImagesBySubjectKey] =
		await Promise.all([
			loadExistingSubjectKeys(reportRows),
			loadTopicImageUrlsByTopic(toSubjectIdsOfKind(reportRows, "topicImage")),
			loadTopicPostImageUrlsByPost(toSubjectIdsOfKind(reportRows, "topicPostImage")),
			loadSubjectImagesBySubjectKey(reportRows),
		])

	// a reported image as it stands now: a Topic's, a Topic Post's, a body image's, or none for any other kind
	const toSubjectImage = ({ subjectKind, subjectId }: ReportedSubjectQuery): TopicImageUrls | null => {
		if (subjectKind === "topicImage") {
			return topicImageUrlsByTopic.get(subjectId) ?? null
		}

		// a body image is signed for the admin
		if (subjectKind === "topicPostBodyImage") {
			return toReportedBodyImageUrls(subjectId)
		}
		return subjectKind === "topicPostImage" ? (topicPostImageUrlsByPost.get(subjectId) ?? null) : null
	}

	// each report with its subject's avatar or images, and what the console offers for it
	return reportRows.map((reportRow) => {
		// the avatar or the images that Remove alone takes down, and whether Remove and Block both delete the subject
		const subjectKey = `${reportRow.subjectKind}:${reportRow.subjectId}`
		const subjectImages = subjectImagesBySubjectKey.get(subjectKey)
		const isRemovableKind = REMOVABLE_REPORT_SUBJECT_KINDS.has(reportRow.subjectKind)
		return {
			id: reportRow.id,
			subjectKind: reportRow.subjectKind,
			subjectId: reportRow.subjectId,
			subjectText: reportRow.subjectText,
			subjectPath: reportRow.subjectPath,
			// a podcast episode's own image, or the reported image
			subjectImage: subjectImages?.subjectImage ?? toSubjectImage(reportRow),
			subjectAvatarVersion: subjectImages?.subjectAvatarVersion ?? null,
			topicPodcastEpisodeVideoPosterUrl: subjectImages?.topicPodcastEpisodeVideoPosterUrl ?? null,
			reason: reportRow.reason,
			createdAt: reportRow.createdAt.toISOString(),
			author:
				reportRow.authorId && reportRow.authorUsername
					? { id: reportRow.authorId, username: reportRow.authorUsername }
					: null,
			reporter: { id: reportRow.reporterId, username: reportRow.reporterUsername },
			// Remove deletes a subject of a removable kind, resets a published avatar, and draws a podcast episode's images
			// again
			canRemove: isRemovableKind || subjectImages !== undefined,
			isSubjectDeleted: isRemovableKind && !existingSubjectKeys.has(subjectKey),
			// an author who is not yet under an admin block can be blocked from the report
			canAdminBlock: Boolean(reportRow.authorId) && reportRow.authorAdminBlockedAt === null,
		}
	})
}

// the open report rows newest first, each with its reporter and its author
// biome-ignore lint/nursery/useExplicitReturnType: the query's type is drizzle's generated builder type
function loadOpenReportRows() {
	return db
		.select({
			id: reports.id,
			subjectKind: reports.subjectKind,
			subjectId: reports.subjectId,
			subjectText: reports.subjectText,
			subjectPath: reports.subjectPath,
			reason: reports.reason,
			createdAt: reports.createdAt,
			// the two people
			reporterId: reporters.id,
			reporterUsername: reporters.username,
			authorId: authors.id,
			authorUsername: authors.username,
			authorAdminBlockedAt: authors.adminBlockedAt,
		})
		.from(reports)
		.innerJoin(reporters, eq(reporters.id, reports.reporterUserId))
		.leftJoin(authors, eq(authors.id, reports.subjectAuthorUserId))
		.where(isNull(reports.resolvedAt))
		.orderBy(desc(reports.createdAt))
}

// a reported body image's column copy at every size, signed for the admin, who may not be one of its post's readers
function toReportedBodyImageUrls(subjectId: string): TopicImageUrls | null {
	// the post and the image the subject names
	const [topicPostId = "", imageId = ""] = subjectId.split("/")
	const bodyImagePath = toTopicPostBodyImagePath({ topicPostId, imageId })
	if (!fromTopicPostBodyImagePath(bodyImagePath)) {
		return null
	}

	// one signed url for every size
	const bodyImageUrl = toSignedTopicPostBodyImageUrl(bodyImagePath)
	const bodyImageSizeUrls = { url: bodyImageUrl, url2x: bodyImageUrl }
	return { page: bodyImageSizeUrls, list: bodyImageSizeUrls, thumbnail: bodyImageSizeUrls }
}

// the avatar or the images that Remove alone takes down, by subject key: each reported profile's and team's published
// avatar, and each reported podcast episode's images. a subject with none to take down has no entry
async function loadSubjectImagesBySubjectKey(
	reportRows: ReportedSubjectQuery[],
): Promise<Map<string, ReportedSubjectImages>> {
	const [profileAvatars, teamAvatars, podcastEpisodeImages] = await Promise.all([
		loadPublishedProfileAvatars(toSubjectIdsOfKind(reportRows, "profile")),
		loadTeamAvatars(toSubjectIdsOfKind(reportRows, "team")),
		loadPodcastEpisodeImages(toSubjectIdsOfKind(reportRows, "podcastEpisode")),
	])
	return new Map([...profileAvatars, ...teamAvatars, ...podcastEpisodeImages])
}

// each reported profile's published avatar by subject key, leaving out a user with no upload and no published
// provider photo
async function loadPublishedProfileAvatars(userIds: string[]): Promise<Map<string, ReportedSubjectImages>> {
	if (userIds.length === 0) {
		return new Map()
	}

	// the avatar columns of each reported profile's user
	const userRows = await db
		.select({ id: users.id, ...publishedAvatarColumns })
		.from(users)
		.where(inArray(users.id, userIds))

	// a published avatar's url names its version
	const publishedUserRows = userRows.filter((userRow) => toPublishedAvatarFromUser(userRow) !== null)
	return new Map(
		publishedUserRows.map((userRow) => [`profile:${userRow.id}`, { subjectAvatarVersion: toAvatarVersion(userRow) }]),
	)
}

// each reported team's uploaded avatar by subject key, leaving out a team with none
async function loadTeamAvatars(teamIds: string[]): Promise<Map<string, ReportedSubjectImages>> {
	if (teamIds.length === 0) {
		return new Map()
	}

	// the stored avatar of each reported team
	const teamRows = await db
		.select({ id: teams.id, avatarKey: teams.avatarKey })
		.from(teams)
		.where(inArray(teams.id, teamIds))

	// an uploaded avatar's url names its version
	const avatarTeamRows = teamRows.filter((teamRow) => teamRow.avatarKey !== null)
	return new Map(
		avatarTeamRows.map((teamRow) => [
			`team:${teamRow.id}`,
			{ subjectAvatarVersion: toAvatarKeyVersion(teamRow.avatarKey) },
		]),
	)
}

// each reported podcast episode's own image and its film's poster by subject key, leaving out a podcast episode that
// is gone, removed, or left with no topic
async function loadPodcastEpisodeImages(podcastEpisodeIds: string[]): Promise<Map<string, ReportedSubjectImages>> {
	if (podcastEpisodeIds.length === 0) {
		return new Map()
	}

	// each podcast episode's status, topic, and image hash with its film's, in one read
	const podcastEpisodeRows = await db
		.select({
			id: podcastEpisodes.id,
			status: podcastEpisodes.status,
			topicId: podcastEpisodes.topicId,
			imageHash: podcastEpisodes.imageHash,
			topicPodcastEpisodeVideoImageHash: topicPodcastEpisodeVideos.imageHash,
		})
		.from(podcastEpisodes)
		.leftJoin(topicPodcastEpisodeVideos, eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodes.id))
		.where(inArray(podcastEpisodes.id, podcastEpisodeIds))

	// leave out a podcast episode that is removed or left with no topic, which has no image to draw again
	const standingPodcastEpisodeRows = podcastEpisodeRows.filter(
		(podcastEpisodeRow) => podcastEpisodeRow.status !== "removed" && podcastEpisodeRow.topicId !== null,
	)

	// map each hash to its urls, null for an image that is not drawn yet and for a film with no image of its own
	return new Map(
		standingPodcastEpisodeRows.map(({ id, imageHash, topicPodcastEpisodeVideoImageHash }) => [
			`podcastEpisode:${id}`,
			{
				subjectImage: imageHash ? toPodcastEpisodeImageUrls(id, imageHash) : null,
				topicPodcastEpisodeVideoPosterUrl: topicPodcastEpisodeVideoImageHash
					? toTopicPodcastEpisodeVideoPosterUrl(id, topicPodcastEpisodeVideoImageHash)
					: null,
			},
		]),
	)
}

// the subject ids of one kind among some reports
function toSubjectIdsOfKind(reportRows: ReportedSubjectQuery[], subjectKind: ReportSubjectKind): string[] {
	return reportRows.filter((reportRow) => reportRow.subjectKind === subjectKind).map((reportRow) => reportRow.subjectId)
}

// the subjects among some reports that still exist, as kind:id keys, for the removable kinds. a topic image exists
// while its topic does, and a topic post's image while its post does
async function loadExistingSubjectKeys(reportRows: ReportedSubjectQuery[]): Promise<Set<string>> {
	// the ids of each removable kind, a chat room message id as the bigint it is
	const chatMessageIds = toSubjectIdsOfKind(reportRows, "chatMessage")
		.map((subjectId) => Number(subjectId))
		.filter((subjectId) => Number.isSafeInteger(subjectId))

	// the notes, the note comments, and the Comments, by their text ids
	const noteIds = toSubjectIdsOfKind(reportRows, "note")
	const noteCommentIds = toSubjectIdsOfKind(reportRows, "noteComment")
	const commentIds = toSubjectIdsOfKind(reportRows, "comment")
	const topicImageTopicIds = toSubjectIdsOfKind(reportRows, "topicImage")
	const topicPostIds = toSubjectIdsOfKind(reportRows, "topicPostImage")
	const bodyImageSubjectIds = toSubjectIdsOfKind(reportRows, "topicPostBodyImage")
	const bodyImageTopicPostIds = bodyImageSubjectIds.map((subjectId) => subjectId.split("/")[0] ?? "")

	// one read per kind that has any
	const [chatMessageRows, noteRows, noteCommentRows, commentRows, topicRows, topicPostRows, bodyImagePostRows] =
		await Promise.all([
			chatMessageIds.length
				? db
						.select({ id: chatRoomMessages.id })
						.from(chatRoomMessages)
						.where(inArray(chatRoomMessages.id, chatMessageIds))
				: [],
			noteIds.length ? db.select({ id: notes.id }).from(notes).where(inArray(notes.id, noteIds)) : [],
			noteCommentIds.length
				? db.select({ id: noteComments.id }).from(noteComments).where(inArray(noteComments.id, noteCommentIds))
				: [],
			commentIds.length ? db.select({ id: comments.id }).from(comments).where(inArray(comments.id, commentIds)) : [],
			topicImageTopicIds.length
				? db.select({ id: topics.id }).from(topics).where(inArray(topics.id, topicImageTopicIds))
				: [],
			topicPostIds.length
				? db.select({ id: topicPosts.id }).from(topicPosts).where(inArray(topicPosts.id, topicPostIds))
				: [],
			// a body image's post, whose body may still show it
			bodyImageTopicPostIds.length
				? db
						.select({ id: topicPosts.id, html: topicPosts.html })
						.from(topicPosts)
						.where(inArray(topicPosts.id, bodyImageTopicPostIds))
				: [],
		])

	// a body image exists while its post's body shows it
	const existingBodyImageSubjectIds = bodyImagePostRows.flatMap((bodyImagePostRow) =>
		toTopicPostBodyImageIds(bodyImagePostRow.html, bodyImagePostRow.id).map(
			(imageId) => `${bodyImagePostRow.id}/${imageId}`,
		),
	)
	return new Set([
		...chatMessageRows.map((chatMessageRow) => `chatMessage:${chatMessageRow.id}`),
		...noteRows.map((noteRow) => `note:${noteRow.id}`),
		...noteCommentRows.map((noteCommentRow) => `noteComment:${noteCommentRow.id}`),
		...commentRows.map((commentRow) => `comment:${commentRow.id}`),
		...topicRows.map((topicRow) => `topicImage:${topicRow.id}`),
		...topicPostRows.map((topicPostRow) => `topicPostImage:${topicPostRow.id}`),
		...existingBodyImageSubjectIds.map((subjectId) => `topicPostBodyImage:${subjectId}`),
	])
}

// what resolving needs: the admin's request context and id, the report, and the resolution
type ResolveReportOptions = {
	context: Context
	adminUserId: string
	reportId: string
	resolution: ReportResolution
}

/**
 * Resolves an open report: Remove deletes the content through its own delete path, Clear leaves it, and Block also
 * sets an admin block on its author. Remove alone resets a reported avatar and draws a reported podcast episode's
 * images again. Returns whether an open report with that id existed.
 */
export async function resolveReport({
	context,
	adminUserId,
	reportId,
	resolution,
}: ResolveReportOptions): Promise<boolean> {
	// the open report, or nothing to resolve
	const [report] = await db
		.select({
			id: reports.id,
			subjectKind: reports.subjectKind,
			subjectId: reports.subjectId,
			subjectAuthorUserId: reports.subjectAuthorUserId,
			subjectText: reports.subjectText,
		})
		.from(reports)
		.where(and(eq(reports.id, reportId), isNull(reports.resolvedAt)))
	if (!report) {
		return false
	}

	// Block puts the author under an admin block, which hides their reactions and comments everywhere
	if (resolution === "blocked" && report.subjectAuthorUserId) {
		await setAdminBlock(report.subjectAuthorUserId, adminUserId)
	}

	// Remove and Block delete the content of a removable kind first, through the path its author or a leader would
	// use. content already gone is fine
	if (resolution !== "cleared" && REMOVABLE_REPORT_SUBJECT_KINDS.has(report.subjectKind)) {
		await removeReportedSubject({ context, adminUserId, subjectKind: report.subjectKind, subjectId: report.subjectId })
	}

	// Remove alone resets a reported avatar and draws a reported podcast episode's images again
	if (resolution === "removed") {
		await removeReportedSubjectImages(report)
	}

	// close the report and drop its copy of the text. Clear keeps a hash, so a later report can tell the text changed
	await db
		.update(reports)
		.set({
			resolution,
			resolvedAt: new Date(),
			resolvedByUserId: adminUserId,
			subjectText: "",
			clearedTextHash: resolution === "cleared" ? toReportTextHash(report.subjectText) : null,
		})
		.where(eq(reports.id, report.id))
	return true
}
