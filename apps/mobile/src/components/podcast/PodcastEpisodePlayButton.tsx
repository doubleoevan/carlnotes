import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import {
	type PodcastEpisodePlayButtonElements,
	PodcastEpisodePlayButton as SharedPodcastEpisodePlayButton,
} from "@carlnotes/core/components/PodcastEpisodePlayButton"
import { cn } from "@carlnotes/nightshift/classNames"
import { Pause, Play } from "lucide-react-native"
import { Pressable } from "react-native"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"

const PLAY_BUTTON_CLASSES = { sm: "size-6 min-h-6 p-0", default: "size-11 p-0", lg: "size-14 p-0" }
const PLAY_ICON_CLASSES = { sm: "size-3", default: "size-4", lg: "size-7" }
const elements: PodcastEpisodePlayButtonElements = {
	Button: ({ children, label, onPress, size, className }) => (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={(event) => {
				event.stopPropagation()
				onPress()
			}}
			hitSlop={toTouchTargetHitSlop(size === "sm" ? 24 : size === "default" ? 44 : 56)}
			className={cn(
				PLAY_BUTTON_CLASSES[size],
				"shrink-0 items-center justify-center rounded-full bg-primary shadow-raised active:opacity-75",
				className,
			)}
		>
			{children}
		</Pressable>
	),
	Icon: ({ isPlaying, size }) => (
		<Icon
			as={isPlaying ? Pause : Play}
			className={cn(PLAY_ICON_CLASSES[size], "text-primary-foreground")}
			fill="currentColor"
		/>
	),
	Tooltip: ({ children }) => children,
}

/**
 * Plays the selected episode through the shared player and platform audio adapter.
 */
export function PodcastEpisodePlayButton({
	episode,
	size = "sm",
	onPress,
}: {
	episode: PodcastEpisodeSummary
	onPress?: () => void
	size?: "sm" | "default" | "lg"
}) {
	return <SharedPodcastEpisodePlayButton podcastEpisode={episode} size={size} elements={elements} onPress={onPress} />
}
