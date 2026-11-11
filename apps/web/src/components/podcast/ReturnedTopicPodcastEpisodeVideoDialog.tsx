// the Video dialog of a film that returned from picture-in-picture on a page with no film player. the film plays on
// in the dialog, and the dialog's own picture-in-picture button sends it back to the floating window
import { TOPIC_PODCAST_EPISODE_VIDEO_NAME } from "@carlnotes/contracts/podcastEpisodes"
import { lazy, Suspense } from "react"
import {
	clearReturnedTopicPodcastEpisodeVideo,
	useReturnedTopicPodcastEpisodeVideo,
} from "@/stores/topicPodcastEpisodeVideoElement"

// the Video dialog and its film player load once a film has returned
const TopicPodcastEpisodeVideoDialog = lazy(() =>
	import("./TopicPodcastEpisodeVideoDialog").then((dialogModule) => ({
		default: dialogModule.TopicPodcastEpisodeVideoDialog,
	})),
)

/**
 * Renders the Video dialog while a film has returned from picture-in-picture with no film player on the page.
 */
export function ReturnedTopicPodcastEpisodeVideoDialog() {
	const returnedPodcastEpisode = useReturnedTopicPodcastEpisodeVideo()
	if (!returnedPodcastEpisode) {
		return null
	}
	return (
		<Suspense fallback={null}>
			<TopicPodcastEpisodeVideoDialog
				podcastEpisodeId={returnedPodcastEpisode.id}
				title={returnedPodcastEpisode.title ?? TOPIC_PODCAST_EPISODE_VIDEO_NAME}
				onClose={clearReturnedTopicPodcastEpisodeVideo}
			/>
		</Suspense>
	)
}
