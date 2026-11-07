// what a podcast episode page passes to its comment thread and its report flag
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import type { SocialSectionProps } from "../components/SocialSection"
import { playPodcastEpisodeChapter } from "../stores/podcastEpisodePlayActions"
import { toPodcastEpisodeTitleLabel } from "./labels"

/**
 * Returns the comment thread props of a podcast episode page, where a comment may name a chapter and a chapter's tag
 * plays from it.
 */
export function toPodcastEpisodeSocialProps(
	{ podcastEpisode, topic, commentThread }: PodcastEpisodePageResponse,
	isSignedIn: boolean,
): Omit<SocialSectionProps, "elements"> {
	return {
		target: { kind: "podcastEpisode", id: podcastEpisode.id },
		firstPage: commentThread,
		isSignedIn,
		topicId: topic.id,
		isTopicOwner: topic.isTopicOwner,
		chapters: podcastEpisode.chapters,
		onChapterPress: (chapterPosition) => void playPodcastEpisodeChapter(podcastEpisode.id, chapterPosition),
	}
}

/**
 * Returns what the report issue option flags on a podcast episode page.
 */
export function toPodcastEpisodeReportSubject(podcastEpisode: PodcastEpisodePageResponse["podcastEpisode"]): {
	subjectKind: "podcastEpisode"
	subjectId: string
	subjectLabel: string
} {
	return {
		subjectKind: "podcastEpisode",
		subjectId: podcastEpisode.id,
		subjectLabel: toPodcastEpisodeTitleLabel(podcastEpisode),
	}
}
