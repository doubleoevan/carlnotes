// what a Reaction or a Comment hangs on, resolved to its Topic, its page's path, and its name, under the rule that
// lets the user open it
import { isPublishedPodcastEpisode } from "@carlnotes/contracts/podcast"
import { toFindingPath, toPodcastEpisodePath, toTopicPath } from "@carlnotes/contracts/seo"
import type { CommentTarget, SocialTarget } from "@carlnotes/contracts/social"
import { db, isFindingShown } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { findings, resources } from "@carlnotes/db/schema/scans"
import { comments } from "@carlnotes/db/schema/social"
import { topics } from "@carlnotes/db/schema/topics"
import { type NamedTopic, namedTopicColumns } from "@carlnotes/db/topicPermissions"
import { and, eq } from "drizzle-orm"
import { isAllowed } from "../authorization"
import { loadAccessiblePodcastEpisode } from "../podcast/podcastEpisodeRows"
import { isTopicFindingVisible } from "../topic/findingPermissions"
import type { SocialReader } from "./socialRows"
import { toRowCommentTarget } from "./socialTargetColumns"

// a social target with the Topic that decides who may read, post, and moderate on it, the path of the page that
// shows it, its name, and what its Comments hang on: itself, or for a Comment, what that Comment hangs on
export type ResolvedSocialTarget = {
	commentTarget: CommentTarget
	topic: NamedTopic
	path: string
	label: string
}

/**
 * Returns who reads a Topic's comments: the user, null for a visitor, whether they may delete anyone's there, and
 * whether they may share one with the podcast, which a user who may edit the Topic does.
 */
export async function toSocialReader(userId: string | null, topic: NamedTopic): Promise<SocialReader> {
	const [canModerate, canShare] = await Promise.all([
		isAllowed(userId, "social:moderate", topic),
		isAllowed(userId, "topic:edit", topic),
	])
	return { userId, canModerate, canShare }
}

// whether a read also finds a Finding rated thumbs down, for what must still reach a Comment on one
type LoadSocialTargetOptions = { isRatedDownIncluded?: boolean }

/**
 * Loads a social target with its Topic, path, and name, whoever asks, or null if it does not exist. A post and a
 * Podcast Episode that is not published do not exist here, and neither does a Finding rated thumbs down unless the
 * read includes one.
 */
export async function loadSocialTarget(
	target: SocialTarget,
	options: LoadSocialTargetOptions = {},
): Promise<ResolvedSocialTarget | null> {
	switch (target.kind) {
		// each kind reads its own table and joins its Topic
		case "topic":
			return loadTopicSocialTarget(target.id)
		case "finding":
			return loadFindingSocialTarget(target.id, options)
		case "podcastEpisode":
			return loadPodcastEpisodeSocialTarget(target.id)
		// a Comment opens where the thing it hangs on does
		case "comment":
			return (await loadCommentWithTarget(target.id, options))?.resolvedSocialTarget ?? null
		// no post exists yet
		case "post":
			return null
	}
}

// a Comment's row and what it hangs on
type CommentWithTarget = { commentRow: typeof comments.$inferSelect; resolvedSocialTarget: ResolvedSocialTarget }

/**
 * Loads a Comment with what it hangs on, whoever asks, or null if either does not exist.
 */
export async function loadCommentWithTarget(
	commentId: string,
	options: LoadSocialTargetOptions = {},
): Promise<CommentWithTarget | null> {
	const [commentRow] = await db.select().from(comments).where(eq(comments.id, commentId))
	const resolvedSocialTarget = commentRow ? await loadSocialTarget(toRowCommentTarget(commentRow), options) : null
	return commentRow && resolvedSocialTarget ? { commentRow, resolvedSocialTarget } : null
}

/**
 * Resolves a social target for a user or a visitor, or null if it does not exist or they may not open it, so a
 * caller says the same thing for both.
 */
export async function resolveSocialTarget(
	userId: string | null,
	target: SocialTarget,
): Promise<ResolvedSocialTarget | null> {
	const resolvedSocialTarget = await loadSocialTarget(target)
	if (!resolvedSocialTarget || !(await canOpenSocialTarget(userId, resolvedSocialTarget))) {
		return null
	}
	return resolvedSocialTarget
}

/**
 * Resolves a social target for a user who may post on it, or null if it does not exist, they may not open it, or they
 * may not post there, so a caller says the same thing for all three.
 */
export async function resolvePostableSocialTarget(
	userId: string,
	target: SocialTarget,
): Promise<ResolvedSocialTarget | null> {
	const resolvedSocialTarget = await resolveSocialTarget(userId, target)
	return resolvedSocialTarget && (await isAllowed(userId, "social:post", resolvedSocialTarget.topic))
		? resolvedSocialTarget
		: null
}

// whether the user may open a social target, by its own kind's read rule
async function canOpenSocialTarget(
	userId: string | null,
	{ commentTarget, topic }: ResolvedSocialTarget,
): Promise<boolean> {
	// a Finding and a Podcast Episode on an invite Topic open only after the subscriber's activation
	if (commentTarget.kind === "finding") {
		return isTopicFindingVisible(userId, commentTarget.id)
	}
	if (commentTarget.kind === "podcastEpisode") {
		return (await loadAccessiblePodcastEpisode({ userId, podcastEpisodeId: commentTarget.id })) !== null
	}
	return isAllowed(userId, "topic:view", topic)
}

// a Topic as a social target, on its own page
async function loadTopicSocialTarget(topicId: string): Promise<ResolvedSocialTarget | null> {
	const [topic] = await db.select(namedTopicColumns).from(topics).where(eq(topics.id, topicId))
	return topic
		? { commentTarget: { kind: "topic", id: topicId }, topic, path: toTopicPath(topic), label: topic.name }
		: null
}

// a Finding as a social target, which opens on its Topic's page
async function loadFindingSocialTarget(
	findingId: string,
	{ isRatedDownIncluded = false }: LoadSocialTargetOptions,
): Promise<ResolvedSocialTarget | null> {
	// the Finding's Topic and its Resource's title, for a Finding still in the feed unless the read includes all
	const [findingRow] = await db
		.select({ topic: namedTopicColumns, title: resources.title, url: resources.url })
		.from(findings)
		.innerJoin(topics, eq(findings.topicId, topics.id))
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(and(eq(findings.id, findingId), isRatedDownIncluded ? undefined : isFindingShown))

	// a missing Finding, or one rated thumbs down
	if (!findingRow) {
		return null
	}

	// the Topic page opens the Finding by its id, and the Finding is named by its page's title
	return {
		commentTarget: { kind: "finding", id: findingId },
		topic: findingRow.topic,
		path: toFindingPath(findingRow.topic, findingId),
		label: findingRow.title ?? findingRow.url,
	}
}

// a published Podcast Episode as a social target, on its own page
async function loadPodcastEpisodeSocialTarget(podcastEpisodeId: string): Promise<ResolvedSocialTarget | null> {
	// the Podcast Episode's Topic, title, season, and number
	const [podcastEpisodeRow] = await db
		.select({
			topic: namedTopicColumns,
			title: podcastEpisodes.title,
			season: podcastEpisodes.season,
			episodeNumber: podcastEpisodes.episodeNumber,
		})
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(and(eq(podcastEpisodes.id, podcastEpisodeId), eq(podcastEpisodes.status, "published")))

	// a published Podcast Episode has its season and number
	if (!podcastEpisodeRow || !isPublishedPodcastEpisode(podcastEpisodeRow)) {
		return null
	}

	// the Podcast Episode's own page, named by its title
	const { topic, title, season, episodeNumber } = podcastEpisodeRow
	return {
		commentTarget: { kind: "podcastEpisode", id: podcastEpisodeId },
		topic,
		path: toPodcastEpisodePath(topic, { season, episodeNumber }),
		label: title ?? topic.name,
	}
}
