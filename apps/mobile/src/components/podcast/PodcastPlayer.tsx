import {
	type PodcastPlayerElements,
	PodcastPlayer as SharedPodcastPlayer,
} from "@carlnotes/core/components/PodcastPlayer"
import { seekPlaybackTo } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { usePathname } from "expo-router"
import { type ComponentProps, useState } from "react"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Text } from "@/components/primitives/text"
import { useIsKeyboardVisible } from "@/hooks/useIsKeyboardVisible"
import { SkipPlaybackButtons } from "./PlaybackControlButtons"
import { PodcastEpisodeCover } from "./PodcastEpisodeCover"
import { PodcastEpisodePlayButton } from "./PodcastEpisodePlayButton"
import { SeekTrack } from "./PodcastEpisodeSeekBar"

export const podcastPlayerElements: PodcastPlayerElements = {
	Frame: PlayerFrame,
	Group: View,
	Text: ({ children, className }) => (
		<Text numberOfLines={1} className={className}>
			{children}
		</Text>
	),
	Link: ({ children, pagePath, title }) =>
		pagePath ? (
			<AnchorLink
				href={pagePath}
				accessibilityLabel={`Open playing episode: ${title}`}
				className="min-w-0 flex-1 flex-row items-center gap-3"
			>
				{children}
			</AnchorLink>
		) : (
			<View className="min-w-0 flex-1 flex-row items-center gap-3">{children}</View>
		),
	Cover: PodcastEpisodeCover,
	Tooltip: ({ children }) => children,
	Announcement: () => null,
	Progress: PlayerProgress,
	Controls: SkipPlaybackButtons,
	Play: ({ podcastEpisode }) => <PodcastEpisodePlayButton episode={podcastEpisode} size="default" />,
}

/**
 * Docks the shared player beneath navigation and above the device safe area.
 */
export function PodcastPlayer() {
	// keep account screens and the component browser focused on their own controls
	const pathname = usePathname()
	if (pathname === "/sign-in" || pathname === "/sign-up" || pathname === "/storybook") {
		return null
	}
	return <SharedPodcastPlayer elements={podcastPlayerElements} />
}

// retain playback controls while giving the composer the progress strip's space during typing
function PlayerProgress({
	positionSeconds,
	durationSeconds,
	playedPercent,
}: ComponentProps<PodcastPlayerElements["Progress"]>) {
	const isKeyboardVisible = useIsKeyboardVisible()
	const [previewPositionSeconds, setPreviewPositionSeconds] = useState<number | null>(null)
	const shownPositionSeconds = previewPositionSeconds ?? positionSeconds
	const shownPercent =
		previewPositionSeconds === null
			? playedPercent
			: Math.min(100, (previewPositionSeconds / Math.max(1, durationSeconds)) * 100)
	if (isKeyboardVisible) {
		return null
	}
	return (
		<View className="h-11">
			<SeekTrack
				positionSeconds={shownPositionSeconds}
				durationSeconds={durationSeconds}
				onPreviewSeek={setPreviewPositionSeconds}
				onSeek={(seconds) => {
					setPreviewPositionSeconds(null)
					seekPlaybackTo(seconds)
				}}
			>
				<View className="h-0.75 flex-1 bg-muted">
					<View className="h-full bg-primary" style={{ width: `${shownPercent}%` }} />
				</View>
			</SeekTrack>
		</View>
	)
}

// reserve actual layout space so every screen, sheet, and Coffee Talk launcher remains unobscured
function PlayerFrame({ children }: { children: React.ReactNode }) {
	// include the device inset only while the dock sits at the screen edge
	const insets = useSafeAreaInsets()
	const isKeyboardVisible = useIsKeyboardVisible()
	return (
		<View
			className="border-t border-separator-strong bg-card"
			style={{ paddingBottom: isKeyboardVisible ? 0 : insets.bottom }}
		>
			{children}
		</View>
	)
}
