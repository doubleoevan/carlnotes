// a podcast episode film's timeline: the intro, one segment per chapter, and the sign-off, placed on the frame grid

// the film's frame rate
export const VIDEO_FRAMES_PER_SECOND = 24

// the lower third fades in this far into a chapter and is gone by its end time
export const LOWER_THIRD_IN_SECONDS = 0.6
export const LOWER_THIRD_OUT_SECONDS = 8

// how long each segment fades in from espresso and out to espresso, and how long the lower third fades
export const SEGMENT_FADE_SECONDS = 0.3
export const LOWER_THIRD_FADE_SECONDS = 0.4

// the shortest that a chapter's Finding and its hot takes may each show. a chapter that would cut either one shorter
// shows its Finding throughout
const HOT_TAKES_MINIMUM_SECONDS = 4

// where one chapter starts and ends in the podcast episode audio, in seconds
type VideoChapterTime = { position: number; startSeconds: number; endSeconds: number }

// one segment of the film. the intro and the sign-off show the film's image, a chapter shows its Finding, and a
// chapter's hot takes show the podcast card from where the hosts turn to them
export type VideoSegment =
	| { kind: "intro"; startSeconds: number; frameCount: number }
	| { kind: "chapter"; position: number; startSeconds: number; frameCount: number }
	| { kind: "hot-takes"; position: number; startSeconds: number; frameCount: number }
	| { kind: "sign-off"; startSeconds: number; frameCount: number }

// the chapter times in any order, where the hosts turn to hot takes in a chapter by its position, and the podcast
// episode audio's exact length in seconds
type ToVideoTimelineOptions = {
	chapterTimes: VideoChapterTime[]
	hotTakesStartSeconds?: Map<number, number>
	durationSeconds: number
}

/**
 * Returns the film's segments in order. The intro runs to the first chapter, a gap between chapters goes to the earlier
 * chapter, and the sign-off runs from the last chapter's end to the audio's end. A chapter with hot takes ends where
 * the hosts turn to them, and its hot takes run from there to the next chapter. A segment with no frames is left out.
 */
export function toVideoTimeline({
	chapterTimes,
	hotTakesStartSeconds = new Map(),
	durationSeconds,
}: ToVideoTimelineOptions): VideoSegment[] {
	// the chapters in order, with each one ending where the next one starts
	const orderedChapterTimes = chapterTimes.toSorted((first, second) => first.startSeconds - second.startSeconds)
	const firstStartSeconds = orderedChapterTimes[0]?.startSeconds ?? durationSeconds
	const lastEndSeconds = orderedChapterTimes.at(-1)?.endSeconds ?? durationSeconds
	const chapterSegments = orderedChapterTimes.flatMap((chapterTime, i): VideoSegment[] => {
		// the chapter shows its Finding to its end, or to its hot takes if both run long enough
		const { position, startSeconds } = chapterTime
		const endSeconds = orderedChapterTimes[i + 1]?.startSeconds ?? chapterTime.endSeconds
		const hotTakesSeconds = hotTakesStartSeconds.get(position) ?? endSeconds
		const hasHotTakes =
			hotTakesSeconds - startSeconds >= HOT_TAKES_MINIMUM_SECONDS &&
			endSeconds - hotTakesSeconds >= HOT_TAKES_MINIMUM_SECONDS
		const findingEndSeconds = hasHotTakes ? hotTakesSeconds : endSeconds

		// the chapter's Finding, then its hot takes
		return [
			{ kind: "chapter", position, startSeconds, frameCount: toFrameCount(startSeconds, findingEndSeconds) },
			{
				kind: "hot-takes",
				position,
				startSeconds: findingEndSeconds,
				frameCount: toFrameCount(findingEndSeconds, endSeconds),
			},
		]
	})

	// the intro before the first chapter and the sign-off after the last, then drop any segment with no frames
	const segments: VideoSegment[] = [
		{ kind: "intro", startSeconds: 0, frameCount: toFrameCount(0, firstStartSeconds) },
		...chapterSegments,
		{ kind: "sign-off", startSeconds: lastEndSeconds, frameCount: toFrameCount(lastEndSeconds, durationSeconds) },
	]
	return segments.filter((segment) => segment.frameCount > 0)
}

/**
 * Returns a segment's length in seconds from its frame count.
 */
export function toSegmentSeconds(frameCount: number): number {
	return frameCount / VIDEO_FRAMES_PER_SECOND
}

// a span's frames, from both ends rounded onto the frame grid, so rounding never adds up across segments
function toFrameCount(startSeconds: number, endSeconds: number): number {
	const frameCount =
		Math.round(endSeconds * VIDEO_FRAMES_PER_SECOND) - Math.round(startSeconds * VIDEO_FRAMES_PER_SECOND)
	return Math.max(0, frameCount)
}
