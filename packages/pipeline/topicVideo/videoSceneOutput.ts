// Verify the silent chapter's stream before it can enter the stream-copy join.
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { VIDEO_FRAMES_PER_SECOND } from "./videoTimeline"

const execute = promisify(execFile)

/** Rejects a truncated capture, an accidental audio stream or an encoder incompatible with the film. */
export async function checkVideoSceneOutput(path: string, frameCount: number, signal?: AbortSignal): Promise<void> {
	// count packets and decoded frames in one pass, bounded by the chapter duration and the render deadline
	const timeout = 30_000 + Math.ceil((frameCount / VIDEO_FRAMES_PER_SECOND) * 1000)
	const { stdout, stderr } = await execute(
		"ffprobe",
		[
			"-v",
			"error",
			"-threads",
			"2",
			"-err_detect",
			"explode",
			"-count_packets",
			"-count_frames",
			"-show_entries",
			"stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_frames,nb_read_packets,nb_read_frames",
			"-of",
			"json",
			path,
		],
		{ signal, timeout, maxBuffer: 16_384 },
	)
	const { streams } = JSON.parse(stdout)
	const [video] = streams
	if (
		stderr.trim() ||
		streams.length !== 1 ||
		video.codec_name !== "h264" ||
		video.width !== 1280 ||
		video.height !== 720 ||
		video.pix_fmt !== "yuv420p" ||
		video.r_frame_rate !== `${VIDEO_FRAMES_PER_SECOND}/1` ||
		Number(video.nb_frames) !== frameCount ||
		Number(video.nb_read_packets) !== frameCount ||
		Number(video.nb_read_frames) !== frameCount
	) {
		throw new Error("Encoded chapter does not match its planned frame count or film format")
	}
}
