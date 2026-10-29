import type { PodcastEpisode, PodcastEpisodeChapter, PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import {
	type FindingChapterPillProps,
	type PodcastEpisodePillElements,
	PodcastEpisodeChapterPill as SharedChapterPill,
	FindingChapterPill as SharedFindingChapterPill,
	PodcastEpisodeNumberPill as SharedNumberPill,
	PodcastEpisodePlaybackPill as SharedPlaybackPill,
} from "@carlnotes/core/components/PodcastEpisodePill"

import { Headphones, Pause, Play } from "lucide-react-native"
import { Pressable } from "react-native"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text, TextClassContext } from "@/components/primitives/text"

export { useIsFindingChapterPlaying } from "@carlnotes/core/components/PodcastEpisodePill"

const elements: PodcastEpisodePillElements = {
	Button: ({ children, label, onPress, className, isHighlighted }) => (
		<TextClassContext.Provider value={isHighlighted ? "text-primary-foreground" : "text-link"}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={label}
				hitSlop={toTouchTargetHitSlop(24)}
				className={`${className} shrink-0 flex-row active:opacity-75`}
				onPress={(event) => {
					event.stopPropagation()
					onPress()
				}}
			>
				{typeof children === "string" ? <Text className="text-xs font-semibold">{children}</Text> : children}
			</Pressable>
		</TextClassContext.Provider>
	),
	Body: ({ text, isPlaying }) => (
		<>
			<Icon as={Headphones} className="size-3" strokeWidth={2.5} />
			<Text className="text-xs font-semibold">{text}</Text>
			<Icon as={isPlaying ? Pause : Play} className="size-2.5" fill="currentColor" strokeWidth={2.5} />
		</>
	),
	Tooltip: ({ children }) => children,
}

/**
 * Adapts the shared chapter pill to the app's standard controls.
 */
export function PodcastEpisodeChapterPill(props: {
	podcastEpisode: PodcastEpisode
	chapter: PodcastEpisodeChapter
	className?: string
}) {
	return <SharedChapterPill {...props} elements={elements} />
}

/**
 * Selects a Finding's narrated chapter and renders its shared pill.
 */
export function FindingChapterPill(props: FindingChapterPillProps) {
	return <SharedFindingChapterPill {...props} elements={elements} />
}

/**
 * Adapts the shared episode-number playback pill.
 */
export function PodcastEpisodeNumberPill({
	podcastEpisode,
	className,
}: {
	podcastEpisode: PodcastEpisodeSummary | null
	className?: string
}) {
	return podcastEpisode ? (
		<SharedNumberPill podcastEpisode={podcastEpisode} className={className} elements={elements} />
	) : null
}

/**
 * Adapts the shared playing or paused toggle.
 */
export function PodcastEpisodePlaybackPill() {
	return <SharedPlaybackPill elements={elements} />
}
