// the film's section of a topic's info: the latest podcast episode's film as one row, with the film's poster under
// a play button that opens the Video dialog, the podcast episode's title, and its details
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { TOPIC_PODCAST_EPISODE_VIDEO_NAME } from "@carlnotes/contracts/podcastEpisodes"
import type { ComponentType } from "react"
import { toPodcastEpisodePosterUrl } from "../lib/podcastEpisodePlayback"
import type { PodcastEpisodeRowProps } from "./PodcastEpisodeRow"
import type { PodcastEpisodeVideoButtonProps } from "./PodcastEpisodeVideoButton"
import type { TopicInfoSectionProps } from "./TopicInfoSection"

// each app's labeled info section, podcast episode row, and Video button
export type TopicPodcastEpisodeVideoInfoSectionElements = {
	Section: ComponentType<TopicInfoSectionProps>
	Row: ComponentType<PodcastEpisodeRowProps>
	VideoButton: ComponentType<PodcastEpisodeVideoButtonProps>
}

// the topic's latest podcast episode, whether the section leads the info, and the app's elements
type TopicPodcastEpisodeVideoInfoSectionProps = {
	podcastEpisode: PodcastEpisode | null
	isFirst?: boolean
	elements: TopicPodcastEpisodeVideoInfoSectionElements
}

/**
 * Composes the film's section of a topic's info, only for a latest podcast episode with a ready film.
 */
export function TopicPodcastEpisodeVideoInfoSection({
	podcastEpisode,
	isFirst,
	elements: { Section, Row, VideoButton },
}: TopicPodcastEpisodeVideoInfoSectionProps) {
	if (!podcastEpisode?.video) {
		return null
	}
	return (
		<Section label={TOPIC_PODCAST_EPISODE_VIDEO_NAME} isFirst={isFirst}>
			{/* the poster's play button in the play button's place, then the row's own title and details */}
			<Row
				podcastEpisode={podcastEpisode}
				podcastEpisodePath={podcastEpisode.pagePath}
				isLatestPodcastEpisode
				playButton={
					<VideoButton
						podcastEpisode={podcastEpisode}
						label="Play film"
						surface="topic-info"
						size="thumbnail"
						posterUrl={toPodcastEpisodePosterUrl(podcastEpisode)}
					/>
				}
			/>
		</Section>
	)
}
