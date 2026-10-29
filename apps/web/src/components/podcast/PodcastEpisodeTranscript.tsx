import type { PodcastEpisodeTranscriptBlock } from "@carlnotes/contracts/podcast"
import {
	type PodcastEpisodeTranscriptElements,
	PodcastEpisodeTranscript as SharedPodcastEpisodeTranscript,
} from "@carlnotes/core/components/PodcastEpisodeTranscript"
import { cn } from "@carlnotes/nightshift/classNames"
import type { ReactNode } from "react"
import { MoreButton } from "@/components/topic/MoreButton"
import { useScrollRegionTabStop } from "@/hooks/useScrollRegionTabStop"
import {
	HIGHLIGHT_SCROLLBAR_CLASS,
	INFO_CARD_CLASS,
	SCRIPTED_ONLY_CLASS,
	SCROLL_REGION_FOCUS_CLASS,
} from "@/lib/styleClasses"

const elements: PodcastEpisodeTranscriptElements = {
	Card: TranscriptCard,
	Group: ({ children, className }) => <div className={className}>{children}</div>,
	Text: ({ children, className }) => <p className={className}>{children}</p>,
	Strong: ({ children, className }) => <span className={className}>{children}</span>,
	Heading: ({ children, className }) => (
		<h3
			className={cn(
				"flex items-center gap-3 before:border-separator-strong before:min-w-6 before:flex-1 before:border-t before:border-dashed after:border-separator-strong after:min-w-6 after:flex-1 after:border-t after:border-dashed",
				className,
			)}
		>
			{children}
		</h3>
	),
	Divider: () => <hr className="border-separator-strong mb-3 border-t border-dashed" />,
	More: (props) => <MoreButton {...props} className={SCRIPTED_ONLY_CLASS} />,
}

/**
 * Adapts the shared transcript to server-visible text and a keyboard-scrollable browser card.
 */
export function PodcastEpisodeTranscript({ transcript }: { transcript: PodcastEpisodeTranscriptBlock[] }) {
	return <SharedPodcastEpisodeTranscript transcript={transcript} elements={elements} />
}

// collapse only after hydration and expose the expanded region to keyboard scrolling
function TranscriptCard({ children, isExpanded }: { children: ReactNode; isExpanded: boolean }) {
	const { ref, tabIndex } = useScrollRegionTabStop<HTMLDivElement>()
	return (
		<div
			ref={ref}
			tabIndex={isExpanded ? tabIndex : undefined}
			className={cn(
				INFO_CARD_CLASS,
				isExpanded
					? ["max-h-160 overflow-y-auto", HIGHLIGHT_SCROLLBAR_CLASS, SCROLL_REGION_FOCUS_CLASS]
					: "scripted:max-h-80 scripted:overflow-hidden scripted:[mask-image:linear-gradient(to_bottom,black_60%,transparent)]",
			)}
		>
			{children}
		</div>
	)
}
