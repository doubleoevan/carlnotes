import type { AnalyticsEventProperties } from "./analyticsEvents"
import type { visibilities } from "./enums"
import { toReportedPath } from "./reportedPath"

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

/**
 * Includes a Topic ID only when the Topic is public.
 */
export function toPublicTopicProperties(topic: {
	id: string
	visibility: (typeof visibilities)[number]
}): AnalyticsEventProperties {
	return topic.visibility === "public" ? { topicId: topic.id } : {}
}

/**
 * Includes episode and Topic attribution only for public podcast episodes.
 */
export function toPublicPodcastEpisodeProperties(episode: {
	id: string
	topicId: string
	topicVisibility: (typeof visibilities)[number]
}): AnalyticsEventProperties {
	return episode.topicVisibility === "public" ? { episodeId: episode.id, topicId: episode.topicId } : {}
}
