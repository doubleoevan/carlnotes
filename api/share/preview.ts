// the link preview of a topic, a team, a profile, or an invitation, and its card image cached in storage
import { and, count, eq } from "drizzle-orm"
import type { Context } from "hono"
import { db } from "../../db"
import { findings, sources, teamMembers, teams, topics, users } from "../../db/schema"
import { attachmentExists, getAttachmentBytes, uploadAttachment } from "../../worker"
import { publishedAvatarColumns, toPublishedAvatar, toPublishedAvatarFromUser } from "../avatars"
import { toVersionedImageHeaders } from "../edgeCache"
import { countDistinctSubscribers } from "../profiles"
import { lastScanSummary, toTeamPublicTopicsFilter, toTopicDescription } from "../seo"
import { toPreviewVersion } from "./previewImage"
import { type ProfilePreview, toProfilePreviewKey, toProfilePreviewPng } from "./profileImage"
import { type TeamPreview, toTeamPreviewKey, toTeamPreviewPng } from "./teamImage"
import { type TopicPreview, toTopicPreviewKey, toTopicPreviewPng } from "./topicImage"

// a card's png bytes, and the version that its url names
export type PreviewPng = { bytes: Uint8Array; version: string }

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
				ownerUserId: users.id,
				ownerUsername: users.username,
				ownerAvatarColumns: publishedAvatarColumns,
			})
			.from(topics)
			.innerJoin(users, eq(users.id, topics.ownerId))
			.where(eq(topics.id, topicId)),
		db.select({ kept: count() }).from(findings).where(eq(findings.topicId, topicId)),
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
		// a public topic's description is its last scan summary, prompt, or name. any other topic's scan summary and
		// prompt stay private, so its description names only its owner and how many findings Carl kept
		description:
			topicRow.visibility === "public"
				? toTopicDescription({ name: topicRow.title, prompt: topicRow.prompt, scanSummary: topicRow.scanSummary })
				: `A topic by ${topicRow.ownerUsername}. ${keptFindingCount} findings Carl kept.`,
	}
}

/**
 * A Topic's preview bytes, rendered on the first request and read from storage after.
 * Rendering the image requires a font parse and a rasterize, so it only happens once per distinct preview.
 */
export async function toCachedTopicPreviewPng(topicPreview: TopicPreview): Promise<PreviewPng> {
	return toCachedPng(toTopicPreviewKey(topicPreview), () => toTopicPreviewPng(topicPreview))
}

/**
 * A profile's preview bytes, rendered on the first request and read from storage after.
 * Rendering the image requires a font parse and a rasterize, so it only happens once per distinct preview.
 */
export async function toCachedProfilePreviewPng(profilePreview: ProfilePreview): Promise<PreviewPng> {
	return toCachedPng(toProfilePreviewKey(profilePreview), () => toProfilePreviewPng(profilePreview))
}

/**
 * Returns a card's png response, cached long only if the url names the card's current version.
 */
export function toPreviewPngResponse(context: Context, previewPng: PreviewPng): Response {
	// return the png, cached long only if the url names the card's current version
	const isCurrentVersion = context.req.query("v") === previewPng.version
	return context.body(previewPng.bytes as unknown as ArrayBuffer, 200, {
		"Content-Type": "image/png",
		...toVersionedImageHeaders(isCurrentVersion),
	})
}

// track pending render by their preview key
const pendingRenderByPreviewKey = new Map<string, Promise<Uint8Array>>()

// the stored bytes for the key, or a render and store on the first request for this exact preview
async function toCachedPng(previewKey: string, renderPng: () => Promise<Uint8Array>): Promise<PreviewPng> {
	const previewVersion = toPreviewVersion(previewKey)
	if (await attachmentExists(previewKey)) {
		return { bytes: await getAttachmentBytes(previewKey), version: previewVersion }
	}

	// a miss joins the render already running for this key, or starts one and drops the entry once settled
	let render = pendingRenderByPreviewKey.get(previewKey)
	if (!render) {
		render = renderAndStorePng(previewKey, renderPng)
		pendingRenderByPreviewKey.set(previewKey, render)
		render.finally(() => pendingRenderByPreviewKey.delete(previewKey)).catch(() => {})
	}
	return { bytes: await render, version: previewVersion }
}

// render the png and store it, so the next fetch of this exact preview is a storage read
async function renderAndStorePng(previewKey: string, renderPng: () => Promise<Uint8Array>): Promise<Uint8Array> {
	const bytes = await renderPng()
	await uploadAttachment(previewKey, bytes, "image/png")
	return bytes
}

/**
 * What a profile's preview shows, or null if no user has that id.
 */
export async function toProfilePreview(userId: string): Promise<ProfilePreview | null> {
	const [user] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, userId))
	if (!user) {
		return null
	}

	// the public figures the profile page itself shows a stranger
	const [topicRow] = await db
		.select({ publicTopics: count() })
		.from(topics)
		.where(and(eq(topics.ownerId, userId), eq(topics.visibility, "public")))
	return {
		userId: user.id,
		username: user.username,
		avatar: await toPublishedAvatar(user.id),
		publicTopicCount: topicRow?.publicTopics ?? 0,
		followerCount: await countDistinctSubscribers(userId),
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

/**
 * An invitation's card bytes for the team or topic its token opens, or null if neither renders one.
 */
export async function toCachedInvitePreviewPng(
	target: { teamId: string } | { topicId: string },
): Promise<PreviewPng | null> {
	// a team's card ignores the public check here, since the token already opens the team
	if ("teamId" in target) {
		const teamPreview = await toInvitedTeamPreview(target.teamId)
		return teamPreview ? toCachedTeamPreviewPng(teamPreview) : null
	}

	// a topic's card is shown at any visibility already, so the token does not need a separate loader
	const topicPreview = await toTopicPreview(target.topicId)
	return topicPreview ? toCachedTopicPreviewPng(topicPreview) : null
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
	const [teamMembersRow] = await db
		.select({ members: count() })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, team.teamId), eq(teamMembers.isActive, true)))
	const [topicRow] = await db.select({ topics: count() }).from(topics).where(toTeamPublicTopicsFilter(team.teamId))

	// the avatar is named instead of loaded, so the card's key changes when the image does
	return {
		teamId: team.teamId,
		name: team.name,
		avatar: team.avatarKey ? { avatarKey: team.avatarKey } : null,
		memberCount: teamMembersRow?.members ?? 0,
		topicCount: topicRow?.topics ?? 0,
	}
}

/**
 * A team's preview image bytes, rendered on the first request and read from storage after.
 */
export async function toCachedTeamPreviewPng(teamPreview: TeamPreview): Promise<PreviewPng> {
	return toCachedPng(toTeamPreviewKey(teamPreview), () => toTeamPreviewPng(teamPreview))
}
