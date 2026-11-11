// the Video dialog: the film player for a podcast episode, on its poster until a press plays it. a dialog that a play
// press opened plays the film once it loads. closing it pauses the film, and the docked player continues it as audio
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { type ComponentType, type ReactNode, useEffect } from "react"
import { useFetchedPodcastEpisode } from "../hooks/useFetchedPodcastEpisode"
import { PODCAST_EPISODE_LOAD_FAILED_TEXT } from "../lib/podcastEpisodeCopy"
import { toPodcastEpisodePlayerState } from "../stores/podcastEpisodePlayerState"
import { playTopicPodcastEpisodeVideo, unloadPodcastEpisode } from "../stores/podcastEpisodePlayerStore"

// each app's frame, film player, and load states
export type TopicPodcastEpisodeVideoDialogElements = {
	// the platform's dialog or sheet, titled, with its close
	Frame: ComponentType<{ title: string; onClose: () => void; children: ReactNode }>
	Player: ComponentType<{ podcastEpisode: PodcastEpisode }>
	Loading: ComponentType
	Failure: ComponentType<{ children: string }>
}

// the podcast episode to show, its title for the heading, whether the film plays once it loads, the close, and the
// app's elements
type TopicPodcastEpisodeVideoDialogProps = {
	podcastEpisodeId: string
	title: string
	shouldPlayOnLoad?: boolean
	onClose: () => void
	elements: TopicPodcastEpisodeVideoDialogElements
}

/**
 * Composes the Video dialog: the player once the podcast episode loads with its film, the loading state, or the
 * failure line.
 */
export function TopicPodcastEpisodeVideoDialog({
	podcastEpisodeId,
	title,
	shouldPlayOnLoad = false,
	onClose,
	elements: { Frame, Player, Loading, Failure },
}: TopicPodcastEpisodeVideoDialogProps) {
	const { podcastEpisode, isFailed } = useFetchedPodcastEpisode(podcastEpisodeId)

	// play the film once it loads, for a dialog that a play press opened. a platform that refuses a play this long
	// after the press leaves the film on its poster, with its play button
	const playedPodcastEpisode = shouldPlayOnLoad && podcastEpisode?.video ? podcastEpisode : null
	useEffect(() => {
		if (!playedPodcastEpisode) {
			return
		}
		void playTopicPodcastEpisodeVideo(playedPodcastEpisode).then((isPlaying) => {
			if (!isPlaying && toPodcastEpisodePlayerState().errorMessage) {
				unloadPodcastEpisode(playedPodcastEpisode.id)
			}
		})
	}, [playedPodcastEpisode])
	return (
		<Frame title={title} onClose={onClose}>
			{podcastEpisode?.video ? (
				<Player podcastEpisode={podcastEpisode} />
			) : isFailed ? (
				<Failure>{PODCAST_EPISODE_LOAD_FAILED_TEXT}</Failure>
			) : (
				<Loading />
			)}
		</Frame>
	)
}
