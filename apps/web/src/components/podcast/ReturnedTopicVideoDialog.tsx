// the Video dialog of a film that returned from picture-in-picture on a page with no film player. the film plays on
// in the dialog, and the dialog's own picture-in-picture button sends it back to the floating window
import { TOPIC_VIDEO_NAME } from "@carlnotes/contracts/podcastEpisodes"
import { lazy, Suspense } from "react"
import { clearReturnedTopicVideo, useReturnedTopicVideo } from "@/stores/topicVideoElement"

// the Video dialog and its film player load once a film has returned
const TopicVideoDialog = lazy(() =>
	import("./TopicVideoDialog").then((dialogModule) => ({
		default: dialogModule.TopicVideoDialog,
	})),
)

/**
 * Renders the Video dialog while a film has returned from picture-in-picture with no film player on the page.
 */
export function ReturnedTopicVideoDialog() {
	const returnedPodcastEpisode = useReturnedTopicVideo()
	if (!returnedPodcastEpisode) {
		return null
	}
	return (
		<Suspense fallback={null}>
			<TopicVideoDialog
				podcastEpisodeId={returnedPodcastEpisode.id}
				title={returnedPodcastEpisode.title ?? TOPIC_VIDEO_NAME}
				onClose={clearReturnedTopicVideo}
			/>
		</Suspense>
	)
}
