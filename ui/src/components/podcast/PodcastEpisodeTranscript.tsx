import type { PodcastEpisodeTranscriptBlock } from "@shared/contracts/podcast"
import { useState } from "react"
import { MoreButton } from "@/components/topic/MoreButton"
import { HIGHLIGHT_SCROLLBAR_CLASS, INFO_CARD_CLASS, SCRIPTED_ONLY_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// the collapsed transcript's height, with its last lines fading out. the transcript collapses only with JavaScript
const COLLAPSED_TRANSCRIPT_CLASS = [
	"scripted:max-h-80 scripted:overflow-hidden",
	"scripted:[mask-image:linear-gradient(to_bottom,black_60%,transparent)]",
].join(" ")

// how tall the expanded transcript grows before the transcript scrolls
const EXPANDED_TRANSCRIPT_CLASS = "max-h-160 overflow-y-auto"

// a dashed separator on each side of a chapter's title
const CHAPTER_TITLE_SEPARATOR_CLASS = [
	"before:border-separator-strong before:min-w-6 before:flex-1 before:border-t before:border-dashed",
	"after:border-separator-strong after:min-w-6 after:flex-1 after:border-t after:border-dashed",
].join(" ")

/**
 * A podcast episode's transcript, each chapter under its title. With JavaScript the transcript collapses behind a
 * control, and the expanded transcript scrolls.
 */
export function PodcastEpisodeTranscript({ transcript }: { transcript: PodcastEpisodeTranscriptBlock[] }) {
	const [isExpanded, setIsExpanded] = useState(false)
	return (
		<>
			{/* the transcript card */}
			<div
				className={cn(
					INFO_CARD_CLASS,
					isExpanded ? [EXPANDED_TRANSCRIPT_CLASS, HIGHLIGHT_SCROLLBAR_CLASS] : COLLAPSED_TRANSCRIPT_CLASS,
				)}
			>
				{transcript.map((transcriptBlock, transcriptBlockIndex) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: a transcript's blocks never reorder
					<div key={transcriptBlockIndex} className="mb-4 last:mb-0">
						{/* a chapter's title inside a dashed separator, or a plain dashed separator over any later block */}
						{transcriptBlock.heading ? (
							<h3 className={cn("mb-2 flex items-center gap-3 text-center font-bold", CHAPTER_TITLE_SEPARATOR_CLASS)}>
								{transcriptBlock.heading}
							</h3>
						) : (
							transcriptBlockIndex > 0 && <hr className="border-separator-strong mb-3 border-t border-dashed" />
						)}
						{/* the block's turns, each after its speaker's name */}
						{transcriptBlock.turns.map((transcriptTurn, transcriptTurnIndex) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: a block's turns never reorder
							<p key={transcriptTurnIndex} className="mb-1.5 leading-relaxed">
								<span className="font-semibold">{`${transcriptTurn.speakerName}: `}</span>
								{transcriptTurn.text}
							</p>
						))}
					</div>
				))}
			</div>
			{/* the read more control */}
			<MoreButton
				isExpanded={isExpanded}
				moreLabel="read more "
				lessLabel="read less "
				onToggle={() => setIsExpanded(!isExpanded)}
				className={SCRIPTED_ONLY_CLASS}
			/>
		</>
	)
}
