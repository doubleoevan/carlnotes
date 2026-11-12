// the details line under a page's byline: its details in order, each one unit of the line, and the counts a topic
// page's line shows

import { toCountLabel } from "@carlnotes/contracts/text"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { TopicCounts } from "@carlnotes/contracts/viewerCounts"

// one count of a details line with the noun it counts. a count that is not known yet is null or undefined
export type CountDetail = { count: number | null | undefined; noun: string }

/**
 * Returns each count with its noun, in the order given, leaving out a count of zero and a count that is not known yet.
 */
export function toCountDetails(countDetails: CountDetail[]): string[] {
	return countDetails.flatMap(({ count, noun }) => (count ? [toCountLabel(count, noun)] : []))
}

/**
 * Returns a detail as the details line shows it: followed by a middle dot unless it ends the line.
 */
export function toDetailText(detail: string, isLastDetail: boolean): string {
	return isLastDetail ? detail : `${detail} ·`
}

/**
 * Returns a topic's viewers as its visitors and its followers for a details line, each left out at zero, or nothing
 * for counts that were not read.
 */
export function toTopicCountsDetails(topicCounts: TopicCounts | null | undefined): string[] {
	return toCountDetails([
		{ count: topicCounts?.viewerCount, noun: "visitor" },
		{ count: topicCounts?.subscriberCount, noun: "follower" },
	])
}

// the topic's page payload, how many findings the page's findings section lists under the user's feed filters, and
// the counts its comment thread and its notes section report once they load
type ToTopicDetailsOptions = {
	topic: Pick<TopicResponse, "podcast" | "commentThread" | "topicPosts" | "relatedTopics">
	findingCount: number
	commentCount: number | null | undefined
	noteCount: number | null | undefined
}

/**
 * Returns the counts of a topic page's details line, each the count its section of the page lists: the latest
 * season's films and podcast episodes, the findings, the comments and replies, the Topic Posts, the notes, and the
 * related topics.
 */
export function toTopicDetails({ topic, findingCount, commentCount, noteCount }: ToTopicDetailsOptions): string[] {
	// the latest season's podcast episodes, and the ones with a film if the topic has a film the user may watch
	const podcastEpisodes = topic.podcast?.seasons.length ? topic.podcast.latestSeasonPodcastEpisodes.podcastEpisodes : []
	const topicPodcastEpisodeVideoCount = topic.podcast?.topicPodcastEpisodeVideoSection
		? podcastEpisodes.filter((podcastEpisode) => podcastEpisode.video).length
		: 0
	return toCountDetails([
		{ count: topicPodcastEpisodeVideoCount, noun: "film" },
		{ count: podcastEpisodes.length, noun: "podcast episode" },
		{ count: findingCount, noun: "finding" },
		{ count: commentCount ?? topic.commentThread?.commentCount, noun: "hot take" },
		{ count: topic.topicPosts?.topicPosts.length, noun: "post" },
		{ count: noteCount, noun: "note" },
		{ count: topic.relatedTopics.length, noun: "similar topic" },
	])
}
