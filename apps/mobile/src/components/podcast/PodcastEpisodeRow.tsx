import {
	type PodcastEpisodeRowElements,
	type PodcastEpisodeRowProps,
	PodcastEpisodeRow as SharedPodcastEpisodeRow,
} from "@carlnotes/core/components/PodcastEpisodeRow"
import { cn } from "@carlnotes/nightshift/classNames"
import { Pause, Play } from "lucide-react-native"
import { Pressable, View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { RemovePodcastEpisodeButton } from "./RemovePodcastEpisodeDialog"

const elements: PodcastEpisodeRowElements = {
	Row: ({ children, className }) => (
		<View className={cn("relative flex-row items-center gap-3 py-2.5 pr-1 pl-2", className)}>{children}</View>
	),
	Group: ({ children }) => <View className="min-w-0 flex-1">{children}</View>,
	Metadata: ({ children }) => <Text className="text-xs text-muted-foreground">{children}</Text>,
	Play: ({ isPlaying, isMuted, onPress, label }) => (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			hitSlop={toTouchTargetHitSlop(44)}
			className={cn(
				"size-11 shrink-0 items-center justify-center rounded-full shadow-raised",
				isMuted ? "bg-muted" : "bg-primary",
			)}
		>
			<Icon
				as={isPlaying ? Pause : Play}
				className={cn("size-4", isMuted ? "text-link" : "text-primary-foreground")}
				fill="currentColor"
			/>
		</Pressable>
	),
	Title: ({ path, children }) =>
		path ? (
			<AnchorLink href={path} accessibilityLabel={`Open ${children}`}>
				<Text className="text-sm font-bold" numberOfLines={1}>
					{children}
				</Text>
			</AnchorLink>
		) : (
			<Text className="text-sm font-bold" numberOfLines={1}>
				{children}
			</Text>
		),
	Remove: RemovePodcastEpisodeButton,
}

/**
 * Adapts shared episode rows to separate platform play, navigation, and removal controls.
 */
export function PodcastEpisodeRow(props: PodcastEpisodeRowProps) {
	return <SharedPodcastEpisodeRow {...props} elements={elements} />
}
