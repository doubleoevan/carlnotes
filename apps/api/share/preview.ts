// the link preview of a topic, a Topic Post, a team, a profile, or an invitation, and its card image cached in storage

import { db, isFindingShown } from "@carlnotes/db"
import { findings } from "@carlnotes/db/schema/scans"
import { teams } from "@carlnotes/db/schema/teams"
import { sources, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { countActiveTeamMembers } from "@carlnotes/db/teamMembers"
import { and, count, eq } from "drizzle-orm"
import { loadUserAvatarRow, publishedAvatarColumns, toPublishedAvatarFromUser } from "../avatars"
import { countDistinctSubscribers } from "../profiles"
import { lastScanSummary, toTeamPublicTopicsFilter, toTopicDescription } from "../seo"
import { loadTopicPostRow, type TopicPostRow } from "../topicPost/topicPosts"
import type { PreviewCard } from "./cardResponse"
import {
	type PodcastEpisodePreview,
	toPodcastEpisodePreviewKey,
	toPodcastEpisodePreviewPng,
} from "./podcastEpisodeImage"
import { type ProfilePreview, toProfilePreviewKey, toProfilePreviewPng } from "./profileImage"
import { type TeamPreview, toTeamPreviewKey, toTeamPreviewPng } from "./teamImage"
import { type TopicPreview, toTopicPreviewKey, toTopicPreviewPng } from "./topicImage"
import {
	type TopicPostPreview,
	toTopicPostPreview,
	toTopicPostPreviewKey,
	toTopicPostPreviewPng,
} from "./topicPostImage"

/**
 * What a Topic's preview shows, or null if no Topic has that id.
 * Every Topic gets a preview whatever its visibility, so a pasted link never looks broken.
 */
export async function toTopicPreview(topicId: string): Promise<TopicPreview | null> {
	// the topic with its owner, and its finding and source counts, read together
	const [[topicRow], [keptRow], [sourceRow]] = await Promise.all([
		db
			.select({
				topicId: topics.id,
				title: topics.name,
				prompt: topics.prompt,
				scanSummary: lastScanSummary,
				visibility: topics.visibility,
				imageHash: topics.imageHash,
				ownerUserId: users.id,
				ownerUsername: users.username,
				ownerAvatarColumns: publishedAvatarColumns,
			})
			.from(topics)
			.innerJoin(users, eq(users.id, topics.ownerId))
			.where(eq(topics.id, topicId)),
		db
			.select({ kept: count() })
			.from(findings)
			.where(and(eq(findings.topicId, topicId), isFindingShown)),
		db
			.select({ sources: count() })
			.from(sources)
			.where(and(eq(sources.topicId, topicId), eq(sources.status, "ready"))),
	])
	// a topic that doesn't exist does not get a preview
	if (!topicRow) {
		return null
	}

	// which image the owner publishes, named instead of loaded
	const keptFindingCount = keptRow?.kept ?? 0
	return {
		topicId: topicRow.topicId,
		title: topicRow.title,
		visibility: topicRow.visibility,
		ownerUserId: topicRow.ownerUserId,
		ownerUsername: topicRow.ownerUsername,
		ownerAvatar: toPublishedAvatarFromUser(topicRow.ownerAvatarColumns),
		keptCount: keptFindingCount,
		sourceCount: sourceRow?.sources ?? 0,
		imageHash: topicRow.imageHash,
		description: toTopicPreviewDescription({
			visibility: topicRow.visibility,
			name: topicRow.title,
			prompt: topicRow.prompt,
			scanSummary: topicRow.scanSummary,
			ownerUsername: topicRow.ownerUsername,
			keptCount: keptFindingCount,
		}),
	}
}

// what a topic preview's description is written from
type TopicPreviewDescriptionFields = {
	visibility: TopicPreview["visibility"]
	name: string
	prompt: string
	scanSummary: string | null
	ownerUsername: string
	keptCount: number
}

/**
 * Returns a topic preview's description. A public topic's description is its last scan summary, prompt, or name. Any
 * other topic's scan summary and prompt stay private, so its description names only its owner and how many findings
 * Carl kept.
 */
export function toTopicPreviewDescription({
	visibility,
	name,
	prompt,
	scanSummary,
	ownerUsername,
	keptCount,
}: TopicPreviewDescriptionFields): string {
	return visibility === "public"
		? toTopicDescription({ name, prompt, scanSummary })
		: `A topic by ${ownerUsername}. ${keptCount} findings Carl kept.`
}

/**
 * A Topic's card, rendered on the first request and read from storage after.
 * Rendering the image requires a font parse and a rasterize, so it only happens once per distinct preview.
 */
export function toTopicPreviewCard(topicPreview: TopicPreview): PreviewCard {
	return { previewKey: toTopicPreviewKey(topicPreview), renderPng: () => toTopicPreviewPng(topicPreview) }
}

// a published Topic Post with its Topic's preview, null for a public Topic's post, and its own card's fields
export type LoadedTopicPostPreview = {
	topicPostRow: TopicPostRow
	topicPreview: TopicPreview | null
	topicPostPreview: TopicPostPreview
}

/**
 * Loads what a published Topic Post's card and page head are built from, or null for a draft and for no post.
 */
export async function loadTopicPostPreview(topicPostId: string): Promise<LoadedTopicPostPreview | null> {
	// a draft has no card
	const topicPostRow = await loadTopicPostRow(topicPostId)
	if (!topicPostRow?.topicPost.publishedAt) {
		return null
	}

	// a public Topic's post is drawn from its own row, with its author's published avatar from the author's columns. any
	// other Topic's post draws its Topic's card, which its Topic's preview reads
	const topicPreview = topicPostRow.topic.visibility === "public" ? null : await toTopicPreview(topicPostRow.topic.id)
	if (topicPostRow.topic.visibility !== "public" && !topicPreview) {
		return null
	}
	const authorAvatar = toPublishedAvatarFromUser(topicPostRow.author)
	return {
		topicPostRow,
		topicPreview,
		topicPostPreview: toTopicPostPreview({ topicPostRow, topicPreview, authorAvatar }),
	}
}

/**
 * A Topic Post's card, rendered on the first request and read from storage after.
 */
export function toTopicPostPreviewCard(topicPostPreview: TopicPostPreview): PreviewCard {
	return {
		previewKey: toTopicPostPreviewKey(topicPostPreview),
		renderPng: () => toTopicPostPreviewPng(topicPostPreview),
	}
}

/**
 * A podcast episode's card, rendered on the first request and read from storage after.
 */
export function toPodcastEpisodePreviewCard(podcastEpisodePreview: PodcastEpisodePreview): PreviewCard {
	return {
		previewKey: toPodcastEpisodePreviewKey(podcastEpisodePreview),
		renderPng: () => toPodcastEpisodePreviewPng(podcastEpisodePreview),
	}
}

/**
 * A profile's card, rendered on the first request and read from storage after.
 * Rendering the image requires a font parse and a rasterize, so it only happens once per distinct preview.
 */
export function toProfilePreviewCard(profilePreview: ProfilePreview): PreviewCard {
	return { previewKey: toProfilePreviewKey(profilePreview), renderPng: () => toProfilePreviewPng(profilePreview) }
}

/**
 * What a profile's preview shows, or null if no user has that id.
 */
export async function toProfilePreview(userId: string): Promise<ProfilePreview | null> {
	// the person's name and avatar, one read a request that only reads shares
	const userAvatarRow = await loadUserAvatarRow(userId)
	if (!userAvatarRow?.username) {
		return null
	}

	// the public figures the profile page itself shows a stranger, read together
	const [[topicRow], followerCount] = await Promise.all([
		db
			.select({ publicTopics: count() })
			.from(topics)
			.where(and(eq(topics.ownerId, userId), eq(topics.visibility, "public"))),
		countDistinctSubscribers(userId),
	])
	return {
		userId,
		username: userAvatarRow.username,
		avatar: toPublishedAvatarFromUser(userAvatarRow),
		publicTopicCount: topicRow?.publicTopics ?? 0,
		followerCount,
	}
}

/**
 * What a team's card shows, or null if there is no public team at that id.
 * A private team renders no card, and its page shows a non-member its name and nothing else.
 */
export async function toTeamPreview(teamId: string): Promise<TeamPreview | null> {
	// the id resolves the team, and a private one reads as no team at all
	const [team] = await db
		.select({ teamId: teams.id, name: teams.name, avatarKey: teams.avatarKey })
		.from(teams)
		.where(and(eq(teams.id, teamId), eq(teams.isPublic, true)))
	return team ? toTeamPreviewWithCounts(team) : null
}

// what an invitation's card shows: the team, the Topic Post, or the topic its token opens
type InvitePreview =
	| { kind: "team"; teamPreview: TeamPreview }
	| { kind: "topicPost"; topicPostPreview: TopicPostPreview }
	| { kind: "topic"; topicPreview: TopicPreview }

/**
 * What an invitation's card shows for the team, the topic, or the Topic Post its token opens, or null if none renders
 * one.
 */
export async function loadInvitePreview(
	target: { teamId: string } | { topicId: string; topicPostId: string | null },
): Promise<InvitePreview | null> {
	// a team's card ignores the public check here, because the token already opens the team
	if ("teamId" in target) {
		const teamPreview = await toInvitedTeamPreview(target.teamId)
		return teamPreview ? { kind: "team", teamPreview } : null
	}

	// an invite shared from a Topic Post shows the post's card while the post is published
	const loadedTopicPostPreview = target.topicPostId ? await loadTopicPostPreview(target.topicPostId) : null
	if (loadedTopicPostPreview) {
		return { kind: "topicPost", topicPostPreview: loadedTopicPostPreview.topicPostPreview }
	}

	// a topic's card is shown at any visibility already, so the token does not need a separate loader
	const topicPreview = await toTopicPreview(target.topicId)
	return topicPreview ? { kind: "topic", topicPreview } : null
}

/**
 * An invitation's card, drawn as the card of the team, the Topic Post, or the topic it shows.
 */
export function toInvitePreviewCard(invitePreview: InvitePreview): PreviewCard {
	if (invitePreview.kind === "team") {
		return toTeamPreviewCard(invitePreview.teamPreview)
	}
	return invitePreview.kind === "topicPost"
		? toTopicPostPreviewCard(invitePreview.topicPostPreview)
		: toTopicPreviewCard(invitePreview.topicPreview)
}

/**
 * What a team's card shows whatever its visibility, for the holder of an invitation that opens it.
 */
export async function toInvitedTeamPreview(teamId: string): Promise<TeamPreview | null> {
	// the token replaces the public check. whoever has the token can already join this team
	const [team] = await db
		.select({ teamId: teams.id, name: teams.name, avatarKey: teams.avatarKey })
		.from(teams)
		.where(eq(teams.id, teamId))
	return team ? toTeamPreviewWithCounts(team) : null
}

// the counts and the avatar on a team's card, read once the row is resolved
async function toTeamPreviewWithCounts(team: {
	teamId: string
	name: string
	avatarKey: string | null
}): Promise<TeamPreview> {
	// the team's active member count and public topic count, which the team page shows a non-member
	const memberCount = await countActiveTeamMembers(team.teamId)
	const [topicRow] = await db.select({ topics: count() }).from(topics).where(toTeamPublicTopicsFilter(team.teamId))

	// the avatar is named instead of loaded, so the card's key changes when the image does
	return {
		teamId: team.teamId,
		name: team.name,
		avatar: team.avatarKey ? { avatarKey: team.avatarKey } : null,
		memberCount,
		topicCount: topicRow?.topics ?? 0,
	}
}

/**
 * A team's card, rendered on the first request and read from storage after.
 */
export function toTeamPreviewCard(teamPreview: TeamPreview): PreviewCard {
	return { previewKey: toTeamPreviewKey(teamPreview), renderPng: () => toTeamPreviewPng(teamPreview) }
}
