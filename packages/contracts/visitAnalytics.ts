import type { AnalyticsEventProperties, VisitAnalyticsEvent } from "./analyticsEvents"
import type { Visibility } from "./enums"
import type { PodcastEpisodeFormat } from "./podcast"
import { toReportedPath } from "./reportedPath"
import { toDiscussionTopicPostId } from "./topicPosts"

// the property of a web vitals event with one metric in it, which repeats the page's url
const WEB_VITALS_METRIC_PATTERN = /^\$web_vitals_\w+_event$/

// a value that reads as an absolute url
const ABSOLUTE_URL_PATTERN = /^https?:\/\//

/**
 * Shapes recognized route IDs and slugs and removes query strings and fragments from reported paths and URLs.
 */
export function toReportedEvent<Event extends { properties?: Record<string, unknown> }>(
	capturedEvent: Event | null,
): Event | null {
	if (!capturedEvent?.properties) {
		return capturedEvent
	}

	// the event's own paths and urls, then each web vitals metric's
	rewritePathsAndUrls(capturedEvent.properties)
	for (const [propertyName, metric] of Object.entries(capturedEvent.properties)) {
		if (WEB_VITALS_METRIC_PATTERN.test(propertyName) && typeof metric === "object" && metric !== null) {
			rewritePathsAndUrls(metric as Record<string, unknown>)
		}
	}
	return capturedEvent
}

// shape known route IDs and slugs and remove query strings and fragments in place
function rewritePathsAndUrls(properties: Record<string, unknown>): void {
	for (const [propertyName, value] of Object.entries(properties)) {
		// a path is named for one, such as $pathname and $prev_pageview_pathname
		if (typeof value === "string" && propertyName.endsWith("pathname")) {
			properties[propertyName] = toReportedPath(value)
		}

		// a url is reported as its origin and its path's shape, so a token in its query string or fragment never leaves
		if (typeof value === "string" && ABSOLUTE_URL_PATTERN.test(value) && URL.canParse(value)) {
			const parsedUrl = new URL(value)
			properties[propertyName] = `${parsedUrl.origin}${toReportedPath(parsedUrl.pathname)}`
		}
	}
}

// where a press opens the Video dialog. the play button labelled "Play film" on a film card of the home's pinned
// films, of its newest films, of a profile's pinned films, and of a team's films. the Video button on a podcast
// episode's row of the news on the home and on a profile
export type TopicPodcastEpisodeVideoDialogSurface =
	| "home-videos"
	| "newest-videos"
	| "profile-videos"
	| "team-videos"
	| "home-news"
	| "profile-news"
	// the play button over the film's poster in a topic's info
	| "topic-info"

// the film visit events, each with only the ids and short codes it holds
export type FilmVisitEvents = {
	visit_episode_format_switched: { podcastEpisodeId: string; format: PodcastEpisodeFormat }
	visit_episode_video_section_toggled: { topicId: string; isOpen: boolean }
	visit_episode_videos_page_viewed: { topicId: string; season: number; page: number }
	visit_episode_video_dialog_opened: { podcastEpisodeId: string; surface: TopicPodcastEpisodeVideoDialogSurface }
}

/**
 * Includes a Topic ID only when the Topic is public.
 */
export function toPublicTopicProperties(topic: { id: string; visibility: Visibility }): AnalyticsEventProperties {
	return topic.visibility === "public" ? { topicId: topic.id } : {}
}

/**
 * Includes episode and Topic attribution only for public podcast episodes.
 */
export function toPublicPodcastEpisodeProperties(episode: {
	id: string
	topicId: string
	topicVisibility: Visibility
}): AnalyticsEventProperties {
	return episode.topicVisibility === "public" ? { episodeId: episode.id, topicId: episode.topicId } : {}
}

// what a play or a finish in the podcast player reports: the event and its properties
type PlayerVisitEvent = { event: VisitAnalyticsEvent; properties: AnalyticsEventProperties }

/**
 * Returns what a play or a finish in the podcast player reports: a podcast episode's own event, a Topic Post
 * Discussion's play with its post and its Topic if the Topic is public, and nothing for a discussion's finish.
 */
export function toPlayerVisitEvent(
	event: "visit_episode_played" | "visit_episode_completed",
	episode: { id: string; topicId: string; topicVisibility: Visibility },
): PlayerVisitEvent | null {
	// a podcast episode reports its own event
	const discussionTopicPostId = toDiscussionTopicPostId(episode.id)
	if (!discussionTopicPostId) {
		return { event, properties: toPublicPodcastEpisodeProperties(episode) }
	}

	// a discussion reports its play alone, by ids
	if (event !== "visit_episode_played") {
		return null
	}
	return {
		event: "social_topic_post_discussion_play",
		properties:
			episode.topicVisibility === "public" ? { objectId: discussionTopicPostId, topicId: episode.topicId } : {},
	}
}
