import { TOPIC_TUTORIAL_VIDEO } from "@carlnotes/contracts/youtube"
import {
	type TopicTutorialVideoOpener,
	toTopicTutorialPlayProperties,
	toTutorialPlayRecorder,
} from "@carlnotes/core/lib/topicTutorialVideo"
import type { ComponentRef } from "react"
import { type RefObject, useMemo } from "react"
import { View } from "react-native"
import { Sheet } from "@/components/common/Sheet"
import { YoutubePlayer } from "@/components/common/YoutubePlayer"
import { captureVisitEvent } from "@/visitAnalytics"

/**
 * Plays the shared tutorial and reports its first actual play during this opening.
 */
export function TopicTutorialVideoDialog({
	opener,
	onClose,
	triggerRef,
}: {
	opener: TopicTutorialVideoOpener
	onClose: () => void
	triggerRef?: RefObject<ComponentRef<typeof View> | null>
}) {
	// report the first actual play during this opening
	const handlePlayerState = useMemo(
		() => toTutorialPlayRecorder(() => captureVisitEvent("visit_video_played", toTopicTutorialPlayProperties(opener))),
		[opener],
	)
	return (
		<Sheet title={TOPIC_TUTORIAL_VIDEO.name} onClose={onClose} triggerRef={triggerRef}>
			{/* the player stays in a readable column on a tablet */}
			<View className="overflow-hidden rounded-md">
				<YoutubePlayer
					youtubeVideoId={TOPIC_TUTORIAL_VIDEO.youtubeVideoId}
					title={TOPIC_TUTORIAL_VIDEO.name}
					thumbnailPath={TOPIC_TUTORIAL_VIDEO.thumbnailPath}
					hasYoutubePlayButton
					onPlay={() => handlePlayerState("playing")}
				/>
			</View>
		</Sheet>
	)
}
