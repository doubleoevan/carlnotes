import { TOPIC_TUTORIAL_VIDEO, toYoutubeWatchUrl, YOUTUBE_PLAY_TRIANGLE_PATH } from "@carlnotes/contracts/youtube"
import {
	type TopicTutorialVideoOpener,
	toTopicTutorialPlayProperties,
	toTutorialPlayRecorder,
} from "@carlnotes/core/lib/topicTutorialVideo"
import { usePostHog } from "posthog-react-native"
import type { ComponentRef } from "react"
import { type RefObject, useMemo } from "react"
import { Text, type View } from "react-native"
import { Path } from "react-native-svg"
import { siYoutube } from "simple-icons"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ClassNameSvg } from "@/components/common/ClassNameSvg"
import { Sheet } from "@/components/common/Sheet"
import { YoutubePlayer } from "@/components/common/YoutubePlayer"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"
import { toTypeRoleStyle } from "@/typeRoleStyles"

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
	const posthog = usePostHog()
	const handlePlayerState = useMemo(
		() => toTutorialPlayRecorder(() => posthog?.capture("visit_video_played", toTopicTutorialPlayProperties(opener))),
		[posthog, opener],
	)
	return (
		<Sheet title={TOPIC_TUTORIAL_VIDEO.name} onClose={onClose} triggerRef={triggerRef}>
			{/* the player stays in a readable column on a tablet */}
			<YoutubePlayer
				youtubeVideoId={TOPIC_TUTORIAL_VIDEO.youtubeVideoId}
				title={TOPIC_TUTORIAL_VIDEO.name}
				thumbnailPath={TOPIC_TUTORIAL_VIDEO.thumbnailPath}
				onPlay={() => handlePlayerState("playing")}
			/>
			{/* a browser fallback never records an unobserved play */}
			<AnchorLink
				href={toYoutubeWatchUrl(TOPIC_TUTORIAL_VIDEO.youtubeVideoId)}
				accessibilityLabel={`Open ${TOPIC_TUTORIAL_VIDEO.name} on YouTube`}
				className="min-h-12 justify-center py-3"
			>
				<Text style={toTypeRoleStyle("body")} className="text-link underline">
					Open on YouTube
				</Text>
			</AnchorLink>
		</Sheet>
	)
}

/**
 * Shows the tutorial's YouTube mark at the user's text scale.
 */
export function TopicTutorialVideoIcon({ size = 16 }: { size?: number }) {
	const iconSize = useFontScaledSize(size)
	return (
		<ClassNameSvg width={iconSize} height={iconSize} viewBox="0 0 24 24">
			<Path d={siYoutube.path} fill={`#${siYoutube.hex}`} />
			<Path d={YOUTUBE_PLAY_TRIANGLE_PATH} fill="white" />
		</ClassNameSvg>
	)
}
