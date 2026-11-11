// what a row of the news says, when it happened, what its play button plays, and the Video button of a row whose
// Podcast Episode has a film
import type { NewsEvent, NewsPlace } from "@carlnotes/contracts/news"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toDotSeparatedText } from "@carlnotes/contracts/text"
import type { TopicPodcastEpisodeVideoDialogSurface } from "@carlnotes/contracts/visitAnalytics"
import type { PodcastEpisodeVideoButtonProps } from "../components/PodcastEpisodeVideoButton"
import { toTimeAgoLabel } from "./chatMessages"
import { toCountLabel } from "./labels"
import { CARL_NAME } from "./socialLabels"

/**
 * Returns a News Event's line. The reactions on the reader's own Comment read as theirs.
 */
export function toNewsEventText(newsEvent: NewsEvent, readerUserId: string | null): string {
	const actorName = newsEvent.actor?.username ?? CARL_NAME
	const topicOrTitle = newsEvent.title ?? newsEvent.topicName
	switch (newsEvent.kind) {
		// a Podcast Episode reads as its title, as its search result does
		case "podcastEpisode":
			return topicOrTitle
		// a Topic Post names who posted it
		case "topicPost":
			return `${actorName} posted ${topicOrTitle}`
		// a Comment's author and first line
		case "comment":
			return `${actorName}: ${newsEvent.text ?? ""}`
		// one reaction names who reacted, and the reactions on one Comment are counted
		case "reaction":
			return newsEvent.reactionCount === null
				? `${actorName} reacted to ${topicOrTitle}`
				: toCommentReactionsText(newsEvent, newsEvent.reactionCount, readerUserId)
		// a Finding reads as its title
		case "finding":
			return topicOrTitle
	}
}

// the reactions on one Comment, counted, with whose Comment it is
function toCommentReactionsText(newsEvent: NewsEvent, reactionCount: number, readerUserId: string | null): string {
	const { commentAuthor } = newsEvent
	const isOwnComment = commentAuthor !== null && commentAuthor.userId === readerUserId
	const authorName = isOwnComment ? "your" : `${commentAuthor?.username ?? CARL_NAME}'s`
	return `${reactionCount} ${reactionCount === 1 ? "reaction" : "reactions"} on ${authorName} hot take`
}

/**
 * Returns the line under a News Event's title. A Podcast Episode's is its search result's, which its Topic's link
 * follows: its kind, its age, and its listeners. Every other row names its Topic and its age.
 */
export function toNewsEventDetailsText(newsEvent: NewsEvent, timeLabel: string): string {
	return newsEvent.kind === "podcastEpisode"
		? toDotSeparatedText(["Podcast", timeLabel, toCountLabel(newsEvent.listenerCount ?? 0, "listener")])
		: toDotSeparatedText([newsEvent.topicName, timeLabel])
}

/**
 * Returns how long ago a News Event happened, as of a time.
 */
export function toNewsEventTimeLabel(newsEvent: NewsEvent, now: number): string {
	return toTimeAgoLabel(new Date(newsEvent.occurredAt).getTime(), now)
}

/**
 * Returns the Podcast Episode a row's play button plays, or null for a row with none. A Podcast Episode's row plays
 * its own, and a Finding's row plays the one whose chapter narrates the Finding.
 */
export function toNewsEventPodcastEpisode(
	newsEvent: Pick<NewsEvent, "kind" | "findingId" | "podcastEpisodeId">,
	podcastEpisodes: PodcastEpisode[],
): PodcastEpisode | null {
	if (newsEvent.kind === "podcastEpisode") {
		return podcastEpisodes.find((podcastEpisode) => podcastEpisode.id === newsEvent.podcastEpisodeId) ?? null
	}
	if (newsEvent.kind !== "finding") {
		return null
	}

	// the Podcast Episode with a chapter that narrates the row's Finding
	const isFindingChapter = (chapter: PodcastEpisode["chapters"][number]): boolean =>
		chapter.findingId === newsEvent.findingId
	return podcastEpisodes.find((podcastEpisode) => podcastEpisode.chapters.some(isFindingChapter)) ?? null
}

// the section that a row's Video button reports, by where the news shows
const NEWS_VIDEO_SURFACES: Record<NewsPlace, TopicPodcastEpisodeVideoDialogSurface> = {
	home: "home-news",
	profile: "profile-news",
}

// the row, the Podcast Episode its play button plays, and where the news shows
type ToNewsEventVideoButtonOptions = {
	newsEvent: Pick<NewsEvent, "kind">
	podcastEpisode: PodcastEpisode | null
	place: NewsPlace
}

/**
 * Returns the Video button of a Podcast Episode's row whose Podcast Episode has a film, as a pill beside the row's play
 * pill, or null for every other row.
 */
export function toNewsEventVideoButton({
	newsEvent,
	podcastEpisode,
	place,
}: ToNewsEventVideoButtonOptions): PodcastEpisodeVideoButtonProps | null {
	if (newsEvent.kind !== "podcastEpisode" || !podcastEpisode?.hasVideo) {
		return null
	}
	return { podcastEpisode, label: "Video", surface: NEWS_VIDEO_SURFACES[place], size: "pill" }
}
