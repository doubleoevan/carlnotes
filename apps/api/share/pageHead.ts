// the page head of a topic, a podcast episode, a Topic Post, a profile, a team, or an invitation, which the page reads
// hold, and the route that serves the join page's

import type { PageHead } from "@carlnotes/contracts/pageHead"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import { toInvitePath, toPodcastFeedPath } from "@carlnotes/contracts/seo"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { toTopicImageUrls } from "@carlnotes/contracts/topicImages"
import type { PodcastEpisodePageAddress } from "@carlnotes/db/visitorPageCaches"
import { appUrl } from "@carlnotes/server/appUrl"
import { Hono } from "hono"
import { loadUserAvatarRow, toPublishedAvatarFromUser } from "../avatars"
import type { AppEnv } from "../currentUser"
import { toInviteTarget } from "../invite/invites"
import { lastScan, type ScanFinding, scanFindings, toCreativeWorkLd, toFindingListLd } from "../jsonLd"
import {
	loadPodcastEpisodePageRow,
	loadPublishedPodcastEpisodeRows,
	type PodcastEpisodePageRow,
} from "../podcast/podcastEpisodeRows"
import { toPodcastSeries, toPodcastSeriesLd } from "../podcast/podcastSeo"
import { loadTopicFeedUpdatedAt } from "../seo"
import { loadTopicRow } from "../topic/accessibleFindings"
import type { TopicPageHeadRows } from "../topic/topics"
import { toTopicPostPageHead } from "../topicPost/topicPostPageHead"
import {
	type PodcastEpisodeTopicPreview,
	toInvitePageHead,
	toPodcastEpisodePageHead,
	toProfilePageHead,
	toTeamPageHead,
	toTopicPageHead,
	toTopicPageUrl,
} from "./pageHeadBuilders"
import { loadTopicPostPreview, toInvitedTeamPreview, toTopicPreview, toTopicPreviewDescription } from "./preview"
import { toPreviewVersion } from "./previewImage"
import type { ProfilePreview } from "./profileImage"
import { type TeamPreview, toTeamPreviewKey } from "./teamImage"
import { type TopicPreview, toTopicPreviewKey } from "./topicImage"
import { toTopicPostPreviewKey } from "./topicPostImage"

// the page head route of the join page, found by the invite's token. a private team's invite still gets a card
export const pageHeadRoute = new Hono<AppEnv>().get("/invites/:token/head", async (context) => {
	const token = context.req.param("token")
	const inviteTarget = await toInviteTarget(token)
	if (!inviteTarget) {
		return context.json({ error: "not found" }, 404)
	}

	// a team invite is named by its team, and a topic invite by its topic
	const invitedTeamPreview = "teamId" in inviteTarget ? await toInvitedTeamPreview(inviteTarget.teamId) : null
	const invitedTopicPreview = "topicId" in inviteTarget ? await toTopicPreview(inviteTarget.topicId) : null
	const name = invitedTeamPreview?.name ?? invitedTopicPreview?.title

	// a topic invite shared from a Topic Post shows the post's card and title while the post is published
	const invitedTopicPostPreview =
		"topicId" in inviteTarget && inviteTarget.topicPostId
			? ((await loadTopicPostPreview(inviteTarget.topicPostId))?.topicPostPreview ?? null)
			: null
	// find the card's storage key. the image url names the key's version
	const invitePreviewKey =
		(invitedTopicPostPreview && toTopicPostPreviewKey(invitedTopicPostPreview)) ??
		(invitedTeamPreview && toTeamPreviewKey(invitedTeamPreview)) ??
		(invitedTopicPreview && toTopicPreviewKey(invitedTopicPreview))
	if (!name || !invitePreviewKey) {
		return context.json({ error: "not found" }, 404)
	}

	// the join page's head, with the card at its current version
	return context.json(
		toInvitePageHead({
			name,
			imageUrl: `${appUrl()}/api/invites/${token}/preview.png?v=${toPreviewVersion(invitePreviewKey)}`,
			inviteUrl: `${appUrl()}${toInvitePath(token)}`,
			kind: invitedTeamPreview ? "team" : "topic",
			topicPostTitle: invitedTopicPostPreview?.title,
		}),
	)
})

/**
 * Loads a topic page's head, or null if no topic has that id. A private or invite topic's head is its card, and never
 * names its findings.
 */
export async function loadTopicPageHead(topicId: string): Promise<PageHead | null> {
	const topicPreview = await toTopicPreview(topicId)
	if (!topicPreview) {
		return null
	}
	if (topicPreview.visibility !== "public") {
		return toTopicPageHead({ topicPreview, appUrl: appUrl(), jsonLd: null })
	}

	// a public topic's last scan's findings, when its feed last changed, and whether it has a published podcast episode
	const [lastScanFindings, feedUpdatedAt, hasPublishedPodcastEpisode] = await Promise.all([
		lastScan(topicPreview.topicId).then((lastScanRow) => (lastScanRow ? scanFindings(lastScanRow.id) : [])),
		loadTopicFeedUpdatedAt(topicPreview.topicId),
		loadTopicRow(topicPreview.topicId).then(async (topic) =>
			topic ? (await loadPublishedPodcastEpisodeRows(topic, null)).length > 0 : false,
		),
	])
	return toPublicTopicPageHead({ topicPreview, lastScanFindings, feedUpdatedAt, hasPublishedPodcastEpisode })
}

/**
 * Returns a topic page's head from the rows that the topic's page already loaded, with no read of its own.
 */
export function toTopicPageHeadFromRows({
	topicWithOwner: { topic, owner },
	sourceCount,
	keptCount,
	scanSummary,
	lastScanFindings,
	feedUpdatedAt,
	hasPublishedPodcastEpisode,
}: TopicPageHeadRows): PageHead {
	// the topic's preview, as toTopicPreview reads it
	const topicPreview: TopicPreview = {
		topicId: topic.id,
		title: topic.name,
		visibility: topic.visibility,
		ownerUserId: owner.userId,
		ownerUsername: owner.username,
		ownerAvatar: toPublishedAvatarFromUser(owner),
		keptCount,
		sourceCount,
		imageHash: topic.imageHash,
		description: toTopicPreviewDescription({
			visibility: topic.visibility,
			name: topic.name,
			prompt: topic.prompt,
			scanSummary,
			ownerUsername: owner.username,
			keptCount,
		}),
	}

	// a private or invite topic's head is its card alone
	if (topicPreview.visibility !== "public") {
		return toTopicPageHead({ topicPreview, appUrl: appUrl(), jsonLd: null })
	}
	return toPublicTopicPageHead({ topicPreview, lastScanFindings, feedUpdatedAt, hasPublishedPodcastEpisode })
}

// a public topic's preview, its last scan's findings, when its feed last changed, and whether it has a published
// podcast episode
type ToPublicTopicPageHeadOptions = {
	topicPreview: TopicPreview
	lastScanFindings: ScanFinding[]
	feedUpdatedAt: Date | null
	hasPublishedPodcastEpisode: boolean
}

// a public topic's head, with structured data from its last scan's findings, dated by when its feed last changed, and
// its podcast feed and podcast series if it has a published podcast episode
function toPublicTopicPageHead({
	topicPreview,
	lastScanFindings,
	feedUpdatedAt,
	hasPublishedPodcastEpisode,
}: ToPublicTopicPageHeadOptions): PageHead {
	const creativeWork = toCreativeWorkLd({
		name: topicPreview.title,
		description: topicPreview.description,
		url: toTopicPageUrl(topicPreview, appUrl()),
		dateModified: feedUpdatedAt,
		authorUsername: topicPreview.ownerUsername,
		findingList: toFindingListLd(lastScanFindings),
		imageUrl: topicPreview.imageHash
			? `${appUrl()}${toTopicImageUrls(topicPreview.topicId, topicPreview.imageHash).page.url2x}`
			: null,
		appUrl: appUrl(),
	})

	// name the podcast feed and the podcast series if the topic has a published podcast episode
	const podcastFeedUrl = hasPublishedPodcastEpisode ? `${appUrl()}${toPodcastFeedPath(topicPreview.topicId)}` : null
	const jsonLd = podcastFeedUrl
		? [creativeWork, toPodcastSeriesLd(toPodcastSeries(topicPreview, appUrl()))]
		: creativeWork
	return toTopicPageHead({ topicPreview, appUrl: appUrl(), jsonLd, podcastFeedUrl })
}

/**
 * Loads a podcast episode page's head, or null if its topic has no published podcast episode at that season and
 * number. A private or invite topic's podcast episode head is its card alone.
 */
export async function loadPodcastEpisodePageHead({
	topicId,
	season,
	episodeNumber,
}: PodcastEpisodePageAddress): Promise<PageHead | null> {
	// the published podcast episode at that season and episode number, from the row the page reads too
	const podcastEpisodePageRow = await loadPodcastEpisodePageRow({ topicId, season, episodeNumber })
	if (!podcastEpisodePageRow) {
		return null
	}
	return toPodcastEpisodePageHead({
		topicPreview: toPodcastEpisodeTopicPreview(podcastEpisodePageRow),
		// the row was found by this season and number, which its own type leaves nullable until publish
		podcastEpisodeRow: { ...podcastEpisodePageRow.podcastEpisodeRow, season, episodeNumber },
		appUrl: appUrl(),
	})
}

// the topic fields of a podcast episode page's head, from the podcast episode's page row
function toPodcastEpisodeTopicPreview({
	topic,
	owner,
	topicHeadFields,
}: PodcastEpisodePageRow): PodcastEpisodeTopicPreview {
	return {
		topicId: topic.id,
		title: topic.name,
		visibility: topic.visibility,
		keptCount: topicHeadFields.keptCount,
		imageHash: topic.imageHash,
		description: toTopicPreviewDescription({
			visibility: topic.visibility,
			name: topic.name,
			prompt: topic.prompt,
			scanSummary: topicHeadFields.scanSummary,
			ownerUsername: owner.username,
			keptCount: topicHeadFields.keptCount,
		}),
	}
}

/**
 * Loads a published Topic Post page's head, or null for a draft and a missing post. A private or invite topic's post
 * head is its card alone.
 */
export async function loadTopicPostPageHead(topicPostId: string): Promise<PageHead | null> {
	const loadedTopicPostPreview = await loadTopicPostPreview(topicPostId)
	return loadedTopicPostPreview ? toTopicPostPageHead({ ...loadedTopicPostPreview, appUrl: appUrl() }) : null
}

/**
 * Returns a profile page's head from the profile the page read already holds, with the person's published avatar from
 * the user row the page read shares. Its public topics are the person's own public ones among the profile's topic
 * cards.
 */
export async function loadProfilePageHeadFromProfile(profile: ProfileResponse): Promise<PageHead> {
	const profilePreview: ProfilePreview = {
		userId: profile.userId,
		username: profile.username,
		avatar: toPublishedAvatarFromUser(await loadUserAvatarRow(profile.userId)),
		publicTopicCount: profile.profileTopics.filter((topicCard) => topicCard.isOwned && topicCard.isPublic).length,
		followerCount: profile.subscriberCount,
	}
	return toProfilePageHead(profilePreview, appUrl())
}

/**
 * Returns a public team's page head from the team's row and the page the page read already holds: its active members,
 * the listed and the hidden, and its public topics among the page's topics.
 */
export function toTeamPageHeadFromPage(
	team: { id: string; name: string; avatarKey: string | null },
	teamPage: Pick<TeamPageResponse, "members" | "hiddenMemberCount" | "topics">,
): PageHead {
	const teamPreview: TeamPreview = {
		teamId: team.id,
		name: team.name,
		avatar: team.avatarKey ? { avatarKey: team.avatarKey } : null,
		memberCount: teamPage.members.filter((member) => member.isActive).length + teamPage.hiddenMemberCount,
		topicCount: teamPage.topics.filter((topic) => topic.visibility === "public").length,
	}
	return toTeamPageHead(teamPreview, appUrl())
}
