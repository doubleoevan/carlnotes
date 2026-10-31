import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import {
	type PodcastPlayerElements,
	PodcastPlayer as SharedPodcastPlayer,
} from "@carlnotes/core/components/PodcastPlayer"
import { seekPlaybackTo } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { toPodcastEpisodeQuestionLabel } from "@carlnotes/core/stores/podcastEpisodeQuestionRules"
import { usePodcastEpisodeQuestion } from "@carlnotes/core/stores/podcastEpisodeQuestionStore"
import { usePathname } from "expo-router"
import { type ComponentProps, type ReactNode, useEffect, useState } from "react"
import { AccessibilityInfo, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Text } from "@/components/primitives/text"
import { useIsKeyboardVisible } from "@/hooks/useIsKeyboardVisible"
import { SkipPlaybackButtons } from "./PlaybackControlButtons"
import { PodcastEpisodeCover } from "./PodcastEpisodeCover"
import { PodcastEpisodePlayButton } from "./PodcastEpisodePlayButton"
import {
	isPodcastEpisodeQuestionButtonShown,
	PodcastEpisodeQuestionButton,
	PodcastEpisodeQuestionStopButton,
} from "./PodcastEpisodeQuestionControls"
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
	Announcement: PhaseAnnouncement,
	Progress: PlayerProgress,
	Controls: PodcastPlayerControls,
	Play: ({ podcastEpisode }) => <PodcastEpisodePlayButton episode={podcastEpisode} size="default" />,
}

/**
 * Docks the shared player beneath navigation and above the device safe area.
 */
export function PodcastPlayer() {
	// read the question, and keep account screens and the component browser focused on their own controls
	const pathname = usePathname()
	const question = usePodcastEpisodeQuestion()
	if (pathname === "/sign-in" || pathname === "/sign-up" || pathname === "/storybook") {
		return null
	}

	// the shared dock, with the question's phase in place of the chapter line
	return <SharedPodcastPlayer phaseLabel={toPodcastEpisodeQuestionLabel(question)} elements={podcastPlayerElements} />
}

// the skips, or the question's stop while a question is in progress, then the mic if the podcast episode has one
function PodcastPlayerControls({ podcastEpisode }: { podcastEpisode: PodcastEpisode }) {
	const question = usePodcastEpisodeQuestion()
	return (
		<>
			{toPodcastEpisodeQuestionLabel(question) ? <PodcastEpisodeQuestionStopButton /> : <SkipPlaybackButtons />}
			{isPodcastEpisodeQuestionButtonShown(podcastEpisode) && (
				<PodcastEpisodeQuestionButton podcastEpisode={podcastEpisode} />
			)}
		</>
	)
}

// the screen reader reads each new phase of a question, the web's polite live region
function PhaseAnnouncement({ children }: { children: ReactNode }) {
	useEffect(() => {
		if (typeof children === "string" && children) {
			AccessibilityInfo.announceForAccessibility(children)
		}
	}, [children])
	return null
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
