// the page head of a topic, a profile, a team, or an invitation, and the routes that serve it

import { appUrl } from "@shared/appUrl"
import type { PageHead } from "@shared/contracts"
import { MINIMUM_SHOWN_FINDINGS } from "@shared/enums"
import { toPageTitle, toPodcastEpisodePath, toPodcastFeedPath, toTopicFeedPath, toTopicPath } from "@shared/seo"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../../db"
import { topics } from "../../db/schema"
import type { AppEnv } from "../currentUser"
import { toInviteTarget } from "../invite/invites"
import {
	loadPublishedPodcastEpisode,
	loadPublishedPodcastEpisodeRows,
	type PodcastEpisodeRow,
} from "../podcast/helpers"
import { toPodcastEpisodeLd, toPodcastSeries, toPodcastSeriesLd } from "../podcast/podcastSeo"
import { lastScan, loadTopicFeedUpdatedAt, scanFindings, toCreativeWorkLd, toFindingListLd } from "../seo"
import { toPodcastEpisodePreview, toPodcastEpisodePreviewKey } from "./podcastEpisodeImage"
import { toInvitedTeamPreview, toProfilePreview, toTeamPreview, toTopicPreview } from "./preview"
import { toCountLabel, toPreviewVersion } from "./previewImage"
import { type ProfilePreview, toProfilePreviewKey } from "./profileImage"
import { type TeamPreview, toTeamPreviewKey } from "./teamImage"
import { type TopicPreview, toTopicPreviewKey } from "./topicImage"

// the page head routes: a topic's, a profile's, a team's, and an invitation's
export const pageHeadRoute = new Hono<AppEnv>()
	// what a topic page puts in its head. a private or invite topic serves its card and never its findings
	.get("/topics/:id/head", async (context) => {
		const topicPreview = await toTopicPreview(context.req.param("id"))
		if (!topicPreview) {
			return context.json({ error: "not found" }, 404)
		}
		if (topicPreview.visibility !== "public") {
			return context.json(toTopicPageHead({ topicPreview, appUrl: appUrl(), jsonLd: null }))
		}

		// build a public topic's structured data from its last scan's findings, dated by when its feed last changed
		const [findingRows, feedUpdatedAt] = await Promise.all([
			lastScan(topicPreview.topicId).then((lastScanRow) => (lastScanRow ? scanFindings(lastScanRow.id) : [])),
			loadTopicFeedUpdatedAt(topicPreview.topicId),
		])
		const creativeWork = toCreativeWorkLd({
			name: topicPreview.title,
			description: topicPreview.description,
			url: toTopicPageUrl(topicPreview, appUrl()),
			dateModified: feedUpdatedAt,
			authorUsername: topicPreview.ownerUsername,
			findingList: toFindingListLd(findingRows),
			appUrl: appUrl(),
		})

		// name the podcast feed and the podcast series if the topic has a published podcast episode
		const [topic] = await db.select().from(topics).where(eq(topics.id, topicPreview.topicId))
		const hasPublishedPodcastEpisode = topic ? (await loadPublishedPodcastEpisodeRows(topic, null)).length > 0 : false
		const podcastFeedUrl = hasPublishedPodcastEpisode ? `${appUrl()}${toPodcastFeedPath(topicPreview.topicId)}` : null
		const jsonLd = podcastFeedUrl
			? [creativeWork, toPodcastSeriesLd(toPodcastSeries(topicPreview, appUrl()))]
			: creativeWork
		return context.json(toTopicPageHead({ topicPreview, appUrl: appUrl(), jsonLd, podcastFeedUrl }))
	})
	// what a podcast episode page puts in its head. a private or invite topic's episode serves its card alone
	.get("/topics/:id/episodes/:season/:episodeNumber/head", async (context) => {
		// respond 404 to a season or an episode number that is not a whole number
		const { id: topicId, season, episodeNumber } = context.req.param()
		const seasonNumber = Number(season)
		const podcastEpisodeNumber = Number(episodeNumber)
		if (!Number.isInteger(seasonNumber) || !Number.isInteger(podcastEpisodeNumber)) {
			return context.json({ error: "not found" }, 404)
		}

		// the topic's preview, and the published podcast episode at that season and episode number
		const [topicPreview, publishedPodcastEpisode] = await Promise.all([
			toTopicPreview(topicId),
			loadPublishedPodcastEpisode({ topicId, season: seasonNumber, episodeNumber: podcastEpisodeNumber }),
		])
		if (!topicPreview || !publishedPodcastEpisode) {
			return context.json({ error: "not found" }, 404)
		}
		return context.json(
			toPodcastEpisodePageHead({
				topicPreview,
				podcastEpisodeRow: publishedPodcastEpisode.podcastEpisodeRow,
				appUrl: appUrl(),
			}),
		)
	})
	// what a profile page puts in its head
	.get("/profiles/:userId/head", async (context) => {
		const profilePreview = await toProfilePreview(context.req.param("userId"))
		if (!profilePreview) {
			return context.json({ error: "not found" }, 404)
		}
		return context.json(toProfilePageHead(profilePreview, appUrl()))
	})
	// what a team page puts in its head. a private team is not found, the same as a missing one
	.get("/teams/:teamId/head", async (context) => {
		const teamPreview = await toTeamPreview(context.req.param("teamId"))
		if (!teamPreview) {
			return context.json({ error: "not found" }, 404)
		}
		return context.json(toTeamPageHead(teamPreview, appUrl()))
	})
	// what the join page puts in its head, found by the invite's token. a private team's invite still gets a card
	.get("/invites/:token/head", async (context) => {
		const token = context.req.param("token")
		const inviteTarget = await toInviteTarget(token)
		if (!inviteTarget) {
			return context.json({ error: "not found" }, 404)
		}

		// a team invite is named by its team, and a topic invite by its topic
		const invitedTeamPreview = "teamId" in inviteTarget ? await toInvitedTeamPreview(inviteTarget.teamId) : null
		const invitedTopicPreview = "topicId" in inviteTarget ? await toTopicPreview(inviteTarget.topicId) : null
		const name = invitedTeamPreview?.name ?? invitedTopicPreview?.title
		// find the card's storage key. the image url names the key's version
		const invitePreviewKey =
			(invitedTeamPreview && toTeamPreviewKey(invitedTeamPreview)) ??
			(invitedTopicPreview && toTopicPreviewKey(invitedTopicPreview))
		if (!name || !invitePreviewKey) {
			return context.json({ error: "not found" }, 404)
		}
		return context.json(
			toInvitePageHead({
				name,
				imageUrl: `${appUrl()}/api/invites/${token}/preview.png?v=${toPreviewVersion(invitePreviewKey)}`,
				inviteUrl: `${appUrl()}/invite/${token}`,
				kind: invitedTeamPreview ? "team" : "topic",
			}),
		)
	})

// what a Topic page's head is built from. jsonLd is null for a page with no structured data,
// and podcastFeedUrl is set once the topic has a published podcast episode
type ToTopicPageHeadOptions = {
	topicPreview: TopicPreview
	appUrl: string
	jsonLd: object | null
	podcastFeedUrl?: string | null
}

/**
 * A Topic page's head: its title, its card, its canonical url, its feeds, and its structured data if given.
 */
export function toTopicPageHead({ topicPreview, appUrl, jsonLd, podcastFeedUrl }: ToTopicPageHeadOptions): PageHead {
	// a public topic names its feed, and is indexed with a canonical url once it is shown
	const isPublicTopic = topicPreview.visibility === "public"
	const isIndexed = isPublicTopic && topicPreview.keptCount >= MINIMUM_SHOWN_FINDINGS
	const pageUrl = toTopicPageUrl(topicPreview, appUrl)
	return {
		title: toPageTitle(topicPreview.title),
		cardTitle: topicPreview.title,
		description: topicPreview.description,
		canonicalUrl: isIndexed ? pageUrl : null,
		cardUrl: pageUrl,
		imageUrl: `${appUrl}/api/topics/${topicPreview.topicId}/preview.png?v=${toPreviewVersion(toTopicPreviewKey(topicPreview))}`,
		feedUrl: isPublicTopic ? `${appUrl}${toTopicFeedPath(topicPreview.topicId)}` : null,
		podcastFeedUrl: podcastFeedUrl ?? null,
		isIndexed,
		jsonLd,
	}
}

// the topic, the podcast episode, and the app's url that a podcast episode page's head is built from
type ToPodcastEpisodePageHeadOptions = {
	topicPreview: TopicPreview
	podcastEpisodeRow: PodcastEpisodeRow
	appUrl: string
}

/**
 * Builds a podcast episode page's head, with the card alone for an episode of a private or invite topic.
 */
export function toPodcastEpisodePageHead({
	topicPreview,
	podcastEpisodeRow,
	appUrl,
}: ToPodcastEpisodePageHeadOptions): PageHead {
	// the podcast episode's page path comes after its topic's page path.
	// a public topic's episode page is indexed once the topic is shown
	const pageUrl = `${appUrl}${toPodcastEpisodePath({ id: topicPreview.topicId, name: topicPreview.title }, podcastEpisodeRow)}`
	const isPublicTopic = topicPreview.visibility === "public"
	const isIndexed = isPublicTopic && topicPreview.keptCount >= MINIMUM_SHOWN_FINDINGS

	// the episode's title, its audio, its topic's podcast, and its card's key
	const podcastEpisodeTitle = podcastEpisodeRow.title ?? topicPreview.title
	const audioUrl = `${appUrl}/api/episodes/${podcastEpisodeRow.id}/audio.mp3`
	const podcastSeries = toPodcastSeries(topicPreview, appUrl)
	const podcastEpisodePreviewKey = toPodcastEpisodePreviewKey(
		toPodcastEpisodePreview(podcastEpisodeRow, topicPreview.title),
	)

	// the head that every podcast episode page has, with its titles, its description, and its card
	const cardPageHead = {
		title: toPageTitle(`${podcastEpisodeTitle} · ${topicPreview.title}`),
		cardTitle: podcastEpisodeTitle,
		description: podcastEpisodeRow.description ?? "",
		canonicalUrl: isIndexed ? pageUrl : null,
		cardUrl: pageUrl,
		imageUrl: `${appUrl}/api/episodes/${podcastEpisodeRow.id}/preview.png?v=${toPreviewVersion(podcastEpisodePreviewKey)}`,
		feedUrl: null,
		isIndexed,
	}

	// a private or invite topic's episode page has its card alone
	if (!isPublicTopic) {
		return { ...cardPageHead, podcastFeedUrl: null, jsonLd: null }
	}

	// a public topic's episode page adds its topic's podcast feed and its structured data
	return {
		...cardPageHead,
		podcastFeedUrl: podcastSeries.feedUrl,
		jsonLd: toPodcastEpisodeLd({
			name: podcastEpisodeTitle,
			description: podcastEpisodeRow.description ?? "",
			url: pageUrl,
			publishedAt: podcastEpisodeRow.publishedAt ?? new Date(),
			durationSeconds: podcastEpisodeRow.durationSeconds ?? 0,
			// where the podcast episode sits in the series
			season: podcastEpisodeRow.season ?? 0,
			episodeNumber: podcastEpisodeRow.episodeNumber ?? 0,
			audioUrl,
			series: podcastSeries,
		}),
	}
}

/**
 * A profile page's head: its title, its card, and its canonical url.
 */
export function toProfilePageHead(profilePreview: ProfilePreview, appUrl: string): PageHead {
	// the title and the profile page's url
	const title = toPageTitle(profilePreview.username)
	const pageUrl = `${appUrl}/profiles/${profilePreview.userId}`
	return {
		title,
		cardTitle: title,
		description: `${profilePreview.username} on CarlNotes. ${toCountLabel(profilePreview.publicTopicCount, "public topic")}, ${toCountLabel(profilePreview.followerCount, "follower")}.`,
		// a profile is indexed and names a canonical url only once it has a public topic
		canonicalUrl: profilePreview.publicTopicCount > 0 ? pageUrl : null,
		cardUrl: pageUrl,
		imageUrl: `${appUrl}/api/profiles/${profilePreview.userId}/preview.png?v=${toPreviewVersion(toProfilePreviewKey(profilePreview))}`,
		feedUrl: null,
		isIndexed: profilePreview.publicTopicCount > 0,
		jsonLd: null,
	}
}

/**
 * A team page's head: its title, its card, and its canonical url.
 */
export function toTeamPageHead(teamPreview: TeamPreview, appUrl: string): PageHead {
	// the title and the team page's url
	const title = toPageTitle(teamPreview.name)
	const pageUrl = `${appUrl}/teams/${teamPreview.teamId}`
	return {
		title,
		cardTitle: title,
		description: `${teamPreview.name} on CarlNotes. ${toCountLabel(teamPreview.memberCount, "member")}, ${toCountLabel(teamPreview.topicCount, "public topic")}.`,
		// a team is indexed and names a canonical url only once it has a public topic
		canonicalUrl: teamPreview.topicCount > 0 ? pageUrl : null,
		cardUrl: pageUrl,
		imageUrl: `${appUrl}/api/teams/${teamPreview.teamId}/preview.png?v=${toPreviewVersion(toTeamPreviewKey(teamPreview))}`,
		feedUrl: null,
		isIndexed: teamPreview.topicCount > 0,
		jsonLd: null,
	}
}

/**
 * The join page's head. A token is a credential, so the page is never indexed. The card url is the invitation
 * itself, so a platform that rewrites a shared link to the card url keeps the token.
 */
export function toInvitePageHead(invitePreview: {
	name: string
	imageUrl: string
	inviteUrl: string
	kind: "team" | "topic"
}): PageHead {
	// a team invitation joins the team, and a topic invitation follows the topic
	const inviteVerb = invitePreview.kind === "team" ? "Join" : "Follow"
	const title = `${inviteVerb} ${invitePreview.name} on CarlNotes`
	return {
		title,
		cardTitle: title,
		description: `You are invited to ${inviteVerb.toLowerCase()} ${invitePreview.name}. Carl reads its sources and shares the notes.`,
		canonicalUrl: null,
		cardUrl: invitePreview.inviteUrl,
		imageUrl: invitePreview.imageUrl,
		feedUrl: null,
		isIndexed: false,
		jsonLd: null,
	}
}

// a Topic page's url, with the topic's slug
function toTopicPageUrl(topicPreview: TopicPreview, appUrl: string): string {
	return `${appUrl}${toTopicPath({ id: topicPreview.topicId, name: topicPreview.title })}`
}
