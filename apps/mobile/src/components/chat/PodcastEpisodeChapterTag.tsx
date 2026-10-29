import {
	type PodcastEpisodeChapterTagElements,
	type PodcastEpisodeChapterTagProps,
	PodcastEpisodeChapterTag as SharedPodcastEpisodeChapterTag,
} from "@carlnotes/core/components/PodcastEpisodeChapterTag"
import { Headphones } from "lucide-react-native"
import { Pressable } from "react-native"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

/**
 * Adapts the shared chat chapter tag to the app's accessible touch target.
 */
export function PodcastEpisodeChapterTag(props: PodcastEpisodeChapterTagProps) {
	return <SharedPodcastEpisodeChapterTag {...props} elements={elements} />
}

// retain the question's width and expose the complete title to assistive technology
const elements: PodcastEpisodeChapterTagElements = {
	Button: ({ children, label, onPress, className }) => (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			hitSlop={toTouchTargetHitSlop(44)}
			className={`${className} flex-row active:opacity-75`}
		>
			{children}
		</Pressable>
	),
	Headphones: () => <Icon as={Headphones} className="size-3.5 shrink-0 text-muted-foreground" />,
	Label: ({ children }) => (
		<Text numberOfLines={1} className="shrink text-xs text-muted-foreground">
			{children}
		</Text>
	),
}
