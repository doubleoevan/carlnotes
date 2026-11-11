import type { PodcastEpisode, PodcastEpisodeChapter } from "@carlnotes/contracts/podcast"
import {
	type PodcastEpisodeSeekBarElements,
	PodcastEpisodeSeekBar as SharedPodcastEpisodeSeekBar,
	type PodcastEpisodeSeekBarProps as SharedPodcastEpisodeSeekBarProps,
} from "@carlnotes/core/components/PodcastEpisodeSeekBar"
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react"
import {
	type ChapterSegmentBox,
	TopicPodcastEpisodeVideoChapterTooltip,
} from "./TopicPodcastEpisodeVideoChapterTooltip"

// the chapter segments of a seek bar, in the chapters' order
const CHAPTER_SEGMENT_SELECTOR = "[data-chapter-segment]"

// how long the pointer rests on the bar before a chapter's tooltip shows, which is the tooltip primitive's hover delay
const CHAPTER_TOOLTIP_DELAY_MS = 200

const elements: PodcastEpisodeSeekBarElements = {
	Group: ({ children, className }) => <div className={className}>{children}</div>,
	Text: ({ children, className }) => <span className={className}>{children}</span>,
	Segment: ({ weight, percent }) => (
		<div
			aria-hidden="true"
			data-chapter-segment
			className="bg-muted h-1.5 overflow-hidden rounded-full"
			style={{ flex: `${weight} 1 0` }}
		>
			<div className="bg-primary h-full" style={{ width: `${percent}%` }} />
		</div>
	),
	Track: ({ children, positionSeconds, durationSeconds, onSeek }) => (
		<div className="relative flex flex-1 gap-1">
			{children}
			<input
				type="range"
				aria-label="Seek"
				min={0}
				max={durationSeconds}
				value={positionSeconds}
				onChange={(event) => onSeek(Number(event.target.value))}
				className="absolute inset-x-0 -inset-y-3 cursor-pointer opacity-0"
			/>
		</div>
	),
}

// the shared bar's props, and whether hovering a chapter's segment shows the chapter's tooltip, as the film's bar does
type PodcastEpisodeSeekBarProps = SharedPodcastEpisodeSeekBarProps & { hasChapterTooltips?: boolean }

/**
 * Adapts the shared segmented bar to a keyboard-accessible browser range input, with a tooltip of the hovered chapter
 * on the film's bar.
 */
export function PodcastEpisodeSeekBar({ hasChapterTooltips = false, ...props }: PodcastEpisodeSeekBarProps) {
	const podcastEpisodeSeekBar = <SharedPodcastEpisodeSeekBar {...props} elements={elements} />
	if (!hasChapterTooltips) {
		return podcastEpisodeSeekBar
	}
	return <ChapterTooltipFrame podcastEpisode={props.podcastEpisode}>{podcastEpisodeSeekBar}</ChapterTooltipFrame>
}

// a chapter with the box of its segment inside the frame
type ChapterSegment = { chapter: PodcastEpisodeChapter; chapterSegmentBox: ChapterSegmentBox }

// the frame around a seek bar that shows the tooltip of the chapter under the pointer. the seek control covers the
// segments and takes every pointer event, so the frame reads the chapter from where the pointer is on the control
function ChapterTooltipFrame({ podcastEpisode, children }: { podcastEpisode: PodcastEpisode; children: ReactNode }) {
	// the chapter whose tooltip shows, the chapter the pointer rests on before it shows, and the delay's timer
	const [shownChapterSegment, setShownChapterSegment] = useState<ChapterSegment | null>(null)
	const restingChapterSegmentRef = useRef<ChapterSegment | null>(null)
	const showTimeoutRef = useRef<number | null>(null)

	// stop the delay's timer once the frame is gone
	useEffect(() => () => window.clearTimeout(showTimeoutRef.current ?? undefined), [])

	// hide the tooltip, and stop one that has not shown yet, once the pointer leaves the seek control
	const hideChapterTooltip = (): void => {
		window.clearTimeout(showTimeoutRef.current ?? undefined)
		showTimeoutRef.current = null
		setShownChapterSegment(null)
	}

	// follow the pointer along the seek control. touch has no hover
	const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
		const chapterSegment = event.pointerType === "touch" ? null : toChapterSegmentAt(event, podcastEpisode.chapters)
		if (!chapterSegment) {
			hideChapterTooltip()
			return
		}

		// a showing tooltip moves to the pointer's chapter at once
		if (shownChapterSegment) {
			if (shownChapterSegment.chapter.position !== chapterSegment.chapter.position) {
				setShownChapterSegment(chapterSegment)
			}
			return
		}

		// otherwise the tooltip shows after the delay, on the chapter the pointer rests on by then
		restingChapterSegmentRef.current = chapterSegment
		showTimeoutRef.current ??= window.setTimeout(() => {
			showTimeoutRef.current = null
			setShownChapterSegment(restingChapterSegmentRef.current)
		}, CHAPTER_TOOLTIP_DELAY_MS)
	}
	return (
		<div className="relative" onPointerMove={handlePointerMove} onPointerLeave={hideChapterTooltip}>
			{children}
			{/* the hovered chapter's tooltip, over its segment */}
			{shownChapterSegment && (
				<TopicPodcastEpisodeVideoChapterTooltip
					podcastEpisodeId={podcastEpisode.id}
					chapter={shownChapterSegment.chapter}
					chapterSegmentBox={shownChapterSegment.chapterSegmentBox}
				/>
			)}
		</div>
	)
}

// the chapter whose segment the pointer is over, with the segment's box inside the frame, or null off the seek control
function toChapterSegmentAt(
	event: PointerEvent<HTMLDivElement>,
	chapters: PodcastEpisodeChapter[],
): ChapterSegment | null {
	// the time labels beside the seek control have no chapter
	if (!(event.target instanceof HTMLInputElement)) {
		return null
	}

	// the first segment that ends at or after the pointer, so the gap before a segment is the segment's own
	const segmentElements = [...event.currentTarget.querySelectorAll(CHAPTER_SEGMENT_SELECTOR)]
	const segmentRects = segmentElements.map((segmentElement) => segmentElement.getBoundingClientRect())
	const segmentIndex = segmentRects.findIndex((segmentRect) => event.clientX <= segmentRect.right)
	const chapter = chapters[segmentIndex]
	const segmentRect = segmentRects[segmentIndex]
	if (!chapter || !segmentRect) {
		return null
	}

	// the segment's box inside the frame
	const frameRect = event.currentTarget.getBoundingClientRect()
	return {
		chapter,
		chapterSegmentBox: {
			left: segmentRect.left - frameRect.left,
			top: segmentRect.top - frameRect.top,
			width: segmentRect.width,
			height: segmentRect.height,
		},
	}
}
