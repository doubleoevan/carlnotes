// the page heads built from a page's preview: a topic's, a podcast episode's, a profile's, a team's, and an
// invitation's, with no read of their own

import { MINIMUM_SHOWN_FINDINGS } from "@carlnotes/contracts/enums"
import type { PageHead } from "@carlnotes/contracts/pageHead"
import type { PublishedPodcastEpisodeNumbers } from "@carlnotes/contracts/podcast"
import { toProfilePageTitle } from "@carlnotes/contracts/profilePage"
import { toPageTitle, toPodcastEpisodePath, toTopicFeedPath, toTopicPath } from "@carlnotes/contracts/seo"
import { toCountLabel } from "@carlnotes/contracts/text"
import type { PodcastEpisodeRow } from "../podcast/podcastEpisodeRows"
import { toPodcastEpisodeLd, toPodcastSeries } from "../podcast/podcastSeo"
import { toPodcastEpisodePreview, toPodcastEpisodePreviewKey } from "./podcastEpisodeImage"
import { toPreviewVersion } from "./previewImage"
import { type ProfilePreview, toProfilePreviewKey } from "./profileImage"
import { type TeamPreview, toTeamPreviewKey } from "./teamImage"
import { type TopicPreview, toTopicPreviewKey } from "./topicImage"

// the topic fields that a podcast episode page's head reads
export type PodcastEpisodeTopicPreview = Pick<
	TopicPreview,
	"topicId" | "title" | "visibility" | "keptCount" | "imageHash" | "description"
>

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

// the topic, the published podcast episode, whose season and number are set, and the app's url that a podcast episode
// page's head is built from
type ToPodcastEpisodePageHeadOptions = {
	topicPreview: PodcastEpisodeTopicPreview
	podcastEpisodeRow: PodcastEpisodeRow & PublishedPodcastEpisodeNumbers
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
		toPodcastEpisodePreview(podcastEpisodeRow, {
			id: topicPreview.topicId,
			name: topicPreview.title,
			imageHash: topicPreview.imageHash,
		}),
	)

	// the head that every podcast episode page has, with its titles, its description, and its card. a private or invite
	// topic's episode description summarizes its findings, which stay private, so its head describes the topic instead
	const cardPageHead = {
		title: toPageTitle(`${podcastEpisodeTitle} · ${topicPreview.title}`),
		cardTitle: podcastEpisodeTitle,
		description: isPublicTopic ? (podcastEpisodeRow.description ?? "") : topicPreview.description,
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
			season: podcastEpisodeRow.season,
			episodeNumber: podcastEpisodeRow.episodeNumber,
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
	const title = toPageTitle(toProfilePageTitle(profilePreview.username))
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
	// the title of the Topic Post a topic invitation was shared from, if any
	topicPostTitle?: string
}): PageHead {
	// a team invitation joins the team, and a topic invitation follows the topic
	const inviteVerb = invitePreview.kind === "team" ? "Join" : "Follow"
	const invitedAction = `${inviteVerb.toLowerCase()} ${invitePreview.name}`

	// an invitation shared from a Topic Post is titled by the post, and says that it opens the post
	const { topicPostTitle } = invitePreview
	const title = topicPostTitle
		? `Read ${topicPostTitle} on CarlNotes`
		: `${inviteVerb} ${invitePreview.name} on CarlNotes`
	return {
		title,
		cardTitle: title,
		description: topicPostTitle
			? `You are invited to ${invitedAction} and read this post.`
			: `You are invited to ${invitedAction}. Carl reads its sources and shares the notes.`,
		canonicalUrl: null,
		cardUrl: invitePreview.inviteUrl,
		imageUrl: invitePreview.imageUrl,
		feedUrl: null,
		isIndexed: false,
		jsonLd: null,
	}
}

// a Topic page's url, with the topic's slug
export function toTopicPageUrl(topicPreview: TopicPreview, appUrl: string): string {
	return `${appUrl}${toTopicPath({ id: topicPreview.topicId, name: topicPreview.title })}`
}
