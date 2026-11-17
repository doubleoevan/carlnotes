import type { PodcastEpisodeChapter } from "@carlnotes/contracts/podcast"
import {
	type PodcastEpisodeSeekBarElements,
	type PodcastEpisodeSeekBarProps,
	PodcastEpisodeSeekBar as SharedPodcastEpisodeSeekBar,
} from "@carlnotes/core/components/PodcastEpisodeSeekBar"
import { toChapterIndexAt } from "@carlnotes/core/lib/podcastEpisodePlayback"
import { type PointerEvent, type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react"
import { PodcastEpisodeChapterPreview } from "./PodcastEpisodeChapterPreview"

// the chapter segments of a seek bar, in the chapters' order
const CHAPTER_SEGMENT_SELECTOR = "[data-chapter-segment]"

// delay opening until hover settles and leave time to cross from the bar to the preview
const CHAPTER_PREVIEW_OPEN_DELAY_MS = 200
const CHAPTER_PREVIEW_CLOSE_DELAY_MS = 300

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
		<div className="relative flex flex-1 gap-1 rounded-full has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-ring">
			{children}
			<input
				type="range"
				aria-label="Seek"
				aria-keyshortcuts="Enter"
				aria-description="Press Enter to show the current chapter source."
				min={0}
				max={durationSeconds}
				value={positionSeconds}
				onChange={(event) => onSeek(Number(event.target.value))}
				className="absolute inset-x-0 -inset-y-3 cursor-pointer opacity-0"
			/>
		</div>
	),
}

// a chapter and its live seek bar segment, which anchors the preview through layout changes
type ChapterSegment = { chapter: PodcastEpisodeChapter; chapterSegmentRef: { current: Element } }
type ShownChapterSegment = ChapterSegment & { seekInput?: HTMLInputElement }

/**
 * Adapts the segmented seek bar to a browser range input with chapter previews for pointer and keyboard navigation.
 */
export function PodcastEpisodeSeekBar(props: PodcastEpisodeSeekBarProps) {
	// reset pending and visible previews when a player switches to another episode
	return <PodcastEpisodeSeekBarFrame key={props.podcastEpisode.id} {...props} />
}

function PodcastEpisodeSeekBarFrame(props: PodcastEpisodeSeekBarProps) {
	// the range input covers the segments, so the frame matches the pointer's position to a chapter
	const { podcastEpisode, format } = props
	const [shownChapterSegment, setShownChapterSegment] = useState<ShownChapterSegment | null>(null)
	const restingChapterSegmentRef = useRef<ChapterSegment | null>(null)
	const openTimeoutRef = useRef<number | undefined>(undefined)
	const closeTimeoutRef = useRef<number | undefined>(undefined)

	// stop both timers when the player goes away
	useEffect(
		() => () => {
			window.clearTimeout(openTimeoutRef.current)
			window.clearTimeout(closeTimeoutRef.current)
		},
		[],
	)

	// cancel dismissal when the pointer enters the preview or returns to the seek bar
	function keepChapterPreviewOpen(): void {
		window.clearTimeout(closeTimeoutRef.current)
		closeTimeoutRef.current = undefined
	}

	// dismiss the preview and cancel either pending transition
	function dismissChapterPreview(): void {
		keepChapterPreviewOpen()
		window.clearTimeout(openTimeoutRef.current)
		openTimeoutRef.current = undefined
		setShownChapterSegment(null)
	}

	// a brief delay keeps the preview open while the pointer crosses the gap above the bar
	function scheduleChapterPreviewDismissal(): void {
		window.clearTimeout(openTimeoutRef.current)
		openTimeoutRef.current = undefined
		if (shownChapterSegment && !shownChapterSegment.seekInput) {
			closeTimeoutRef.current ??= window.setTimeout(dismissChapterPreview, CHAPTER_PREVIEW_CLOSE_DELAY_MS)
		}
	}

	// follow the pointer along the range input. the portalled preview also bubbles through this frame
	function handlePointerMove(event: PointerEvent<HTMLFieldSetElement>): void {
		if (
			event.pointerType === "touch" ||
			shownChapterSegment?.seekInput ||
			!(event.target instanceof Node) ||
			!event.currentTarget.contains(event.target)
		) {
			return
		}
		const chapterSegment = toChapterSegmentAt(event, podcastEpisode.chapters)
		if (!chapterSegment) {
			scheduleChapterPreviewDismissal()
			return
		}

		// switch an open preview to the new chapter immediately
		keepChapterPreviewOpen()
		if (shownChapterSegment) {
			if (shownChapterSegment.chapter.position !== chapterSegment.chapter.position) {
				setShownChapterSegment(chapterSegment)
			}
			return
		}

		// show the chapter the pointer rests on after the hover delay
		restingChapterSegmentRef.current = chapterSegment
		openTimeoutRef.current ??= window.setTimeout(() => {
			openTimeoutRef.current = undefined
			setShownChapterSegment(restingChapterSegmentRef.current)
		}, CHAPTER_PREVIEW_OPEN_DELAY_MS)
	}

	// open the source for the seek position without changing playback
	function handleSeekKeyDown(event: ReactKeyboardEvent<HTMLFieldSetElement>): void {
		const seekInput = event.target
		if (event.key !== "Enter" || !(seekInput instanceof HTMLInputElement) || seekInput.type !== "range") {
			return
		}

		// use the same chapter selection as playback and position the preview by its segment
		const chapterIndex = toChapterIndexAt(podcastEpisode.chapters, Number(seekInput.value))
		const chapter = podcastEpisode.chapters[chapterIndex]
		const segment = event.currentTarget.querySelectorAll(CHAPTER_SEGMENT_SELECTOR)[chapterIndex]
		if (!chapter || !segment) {
			return
		}

		// cancel pending pointer work and move focus to the source link in the preview
		event.preventDefault()
		dismissChapterPreview()
		setShownChapterSegment({ chapter, chapterSegmentRef: { current: segment }, seekInput })
	}

	// return to the seek input when Escape dismisses a keyboard-opened preview
	function handlePreviewEscape(event: KeyboardEvent): void {
		const seekInput = shownChapterSegment?.seekInput
		if (seekInput) {
			event.preventDefault()
			dismissChapterPreview()
			seekInput.focus()
		}
	}

	return (
		<fieldset
			className="relative min-w-0"
			aria-label="Chapter playback"
			onPointerMove={handlePointerMove}
			onPointerLeave={scheduleChapterPreviewDismissal}
			onKeyDown={handleSeekKeyDown}
		>
			<SharedPodcastEpisodeSeekBar {...props} elements={elements} />
			{/* remount an open preview when switching from hover to keyboard focus */}
			{shownChapterSegment && (
				<PodcastEpisodeChapterPreview
					key={shownChapterSegment.seekInput ? "keyboard" : "pointer"}
					podcastEpisodeId={podcastEpisode.id}
					chapter={shownChapterSegment.chapter}
					chapterSegmentRef={shownChapterSegment.chapterSegmentRef}
					hasVideo={format === "video" || podcastEpisode.hasVideo === true || Boolean(podcastEpisode.video)}
					shouldFocusSource={Boolean(shownChapterSegment.seekInput)}
					onPointerEnter={keepChapterPreviewOpen}
					onPointerLeave={scheduleChapterPreviewDismissal}
					onDismiss={dismissChapterPreview}
					onEscapeKeyDown={handlePreviewEscape}
				/>
			)}
		</fieldset>
	)
}

// the chapter and live segment under the pointer, or null off the seek control
function toChapterSegmentAt(
	event: PointerEvent<HTMLFieldSetElement>,
	chapters: PodcastEpisodeChapter[],
): ChapterSegment | null {
	// the time labels beside the seek control have no chapter
	if (!(event.target instanceof HTMLInputElement)) {
		return null
	}

	// the first segment that ends at or after the pointer, so the gap before a segment is the segment's own
	const segments = event.currentTarget.querySelectorAll(CHAPTER_SEGMENT_SELECTOR)
	for (const [index, segment] of segments.entries()) {
		const chapter = chapters[index]
		if (chapter && event.clientX <= segment.getBoundingClientRect().right) {
			return { chapter, chapterSegmentRef: { current: segment } }
		}
	}
	return null
}
