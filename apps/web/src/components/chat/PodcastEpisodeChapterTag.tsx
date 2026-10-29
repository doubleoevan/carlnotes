import {
	type PodcastEpisodeChapterTagElements,
	type PodcastEpisodeChapterTagProps,
	PodcastEpisodeChapterTag as SharedPodcastEpisodeChapterTag,
} from "@carlnotes/core/components/PodcastEpisodeChapterTag"
import { cn } from "@carlnotes/nightshift/classNames"
import { Headphones } from "lucide-react"
import { IconButton } from "@/components/common/IconButton"
import { QUESTION_BUBBLE_WIDTH_CLASS } from "@/lib/styleClasses"

/**
 * Adapts the shared chat chapter tag to browser controls and tooltips.
 */
export function PodcastEpisodeChapterTag(props: PodcastEpisodeChapterTagProps) {
	return <SharedPodcastEpisodeChapterTag {...props} elements={elements} />
}

// retain the browser's question width, tooltip, and truncation
const elements: PodcastEpisodeChapterTagElements = {
	Button: ({ children, label, onPress, className }) => (
		<IconButton tooltip={label} onClick={onPress} className={cn(className, QUESTION_BUBBLE_WIDTH_CLASS)}>
			{children}
		</IconButton>
	),
	Headphones: () => <Headphones className="size-3.5 shrink-0" />,
	Label: ({ children }) => <span className="truncate">{children}</span>,
}
