// a podcast episode film's audio on a local file, and what the render and the rebuild read from it: its exact length,
// the film's timeline with where the hosts turn to Comments, and the captions timed with the pauses in it

import { join } from "node:path"
import { downloadPodcastEpisodeFile } from "@carlnotes/db/store"
import { probeDurationSeconds } from "@carlnotes/models/ffmpeg"
import {
	type RenderableTopicVideoPodcastEpisode,
	toVideoCaptionChapters,
	type VideoChapterRow,
} from "./topicVideoInputs"
import { detectPauseSeconds, toVideoCaptionCues, type VideoCaptionCue } from "./videoCaptions"
import { loadHotTakesStartSeconds } from "./videoHotTakes"
import { toVideoTimeline, type VideoSegment } from "./videoTimeline"

// the podcast episode, its chapters, the folder that the audio is downloaded to, and the signal that stops the ffmpeg
// runs
type LoadVideoAudioOptions = {
	topicVideoPodcastEpisode: RenderableTopicVideoPodcastEpisode
	videoChapterRows: VideoChapterRow[]
	workDirectory: string
	signal?: AbortSignal
}

// the audio's file and its exact length in seconds, the film's segments, and its captions
export type VideoAudio = {
	audioPath: string
	durationSeconds: number
	segments: VideoSegment[]
	captionCues: VideoCaptionCue[]
}

/**
 * Downloads a podcast episode's audio and returns its length, the film's timeline from the chapters and where the
 * hosts turn to Comments in them, and the captions from the script, timed with the pauses in the audio.
 */
export async function loadVideoAudio({
	topicVideoPodcastEpisode,
	videoChapterRows,
	workDirectory,
	signal,
}: LoadVideoAudioOptions): Promise<VideoAudio> {
	// the audio, its exact length, and the pauses in it
	const { podcastEpisodeId, audioKey, script } = topicVideoPodcastEpisode
	const audioPath = join(workDirectory, "audio.mp3")
	await downloadPodcastEpisodeFile({ key: audioKey, filePath: audioPath, signal })
	const durationSeconds = await probeDurationSeconds(audioPath, signal)
	const pauseSeconds = await detectPauseSeconds(audioPath, signal)

	// the timeline from the chapters and where the hosts turn to Comments in them
	const hotTakesStartSeconds = await loadHotTakesStartSeconds({
		podcastEpisodeId,
		script,
		videoChapterRows,
		pauseSeconds,
	})
	const segments = toVideoTimeline({ chapterTimes: videoChapterRows, hotTakesStartSeconds, durationSeconds })

	// the captions from the script, timed with the pauses in the audio
	const recordedCues = toVideoCaptionCues({
		chapters: toVideoCaptionChapters(script, videoChapterRows),
		pauseSeconds,
		hotTakesStartSeconds: segments.flatMap((segment) => (segment.kind === "hot-takes" ? [segment.startSeconds] : [])),
	})
	// Older episode timings can include trailing silence after the published recording ends.
	const captionCues = recordedCues
		.filter((cue) => cue.startSeconds < durationSeconds)
		.map((cue) => ({ ...cue, endSeconds: Math.min(cue.endSeconds, durationSeconds) }))
	return { audioPath, durationSeconds, segments, captionCues }
}
