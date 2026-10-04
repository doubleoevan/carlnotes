// a Podcast Episode's audio. one speech call per chapter, written to object storage, then joined and encoded by ffmpeg.
// audio passes between activities only through object storage. each activity may run on another worker replica
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { podcastEpisodes } from "../../db/schema"
import { type SpeechTier, speechCost } from "../budget"
import { loadOrProvisionUserLiteLLMKey } from "../litellm"
import { renderSpeech, SPEECH_BYTES_PER_SECOND, WAV_HEADER_BYTES } from "../speech"
import {
	downloadPodcastEpisodeFile,
	toPodcastEpisodeAudioKey,
	toPodcastEpisodeChapterKey,
	uploadAttachment,
	uploadPodcastEpisodeFile,
} from "../store"
import { toChapterTurns } from "./podcastEpisodeScript"
import { addPodcastEpisodeCost } from "./writePodcastEpisodeScript"

// the podcast loudness. -16 LUFS with a true peak of -1.5 dB, measured as mono
const LOUDNESS_FILTER = "loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true"

// the finished file. a 64 kbps mono MP3 at 44.1 kHz, about 14 MB for 30 minutes
const MP3_BITRATE = "64k"
const MP3_SAMPLE_RATE = "44100"

// one chapter's render. the Podcast Episode, the user that the call bills, the chapter's position, and the speech tier
export type RenderPodcastEpisodeChapterOptions = {
	podcastEpisodeId: string
	billedUserId: string
	position: number
	speechTier: SpeechTier
}

// a rendered chapter. its position, where its audio is stored, and how many bytes the audio is
export type RenderedChapter = { position: number; chapterKey: string; byteSize: number }

// where a chapter starts and ends in the Podcast Episode's audio
export type ChapterTime = { startSeconds: number; endSeconds: number }

// the stored Podcast Episode audio. its key, its byte size, its length in seconds, and each chapter's times in order
export type EncodedPodcastEpisode = {
	audioKey: string
	audioByteSize: number
	durationSeconds: number
	chapterTimes: ChapterTime[]
}

// a speech call that did not render, and whether another attempt can help
export class SpeechFailedError extends Error {
	constructor(
		message: string,
		readonly isRetryable: boolean,
	) {
		super(message)
	}
}

/**
 * Renders one chapter as one two-speaker speech call on the billed user's key and writes its audio to object storage.
 * Throws a SpeechFailedError if the call did not render.
 */
export async function renderPodcastEpisodeChapter({
	podcastEpisodeId,
	billedUserId,
	position,
	speechTier,
}: RenderPodcastEpisodeChapterOptions): Promise<RenderedChapter> {
	// read the chapter's turns from the script saved on the row
	const [podcastEpisode] = await db
		.select({ script: podcastEpisodes.script })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	const turns = podcastEpisode?.script ? toChapterTurns(podcastEpisode.script)[position] : undefined
	if (!turns) {
		throw new SpeechFailedError(`episode ${podcastEpisodeId} has no chapter ${position} to render`, false)
	}

	// render the chapter's speech on the billed user's key. only a retryable failure is worth another attempt
	const litellmApiKey = await loadOrProvisionUserLiteLLMKey(billedUserId)
	const renderSpeechResult = await renderSpeech({ turns, speechTier, litellmApiKey })
	if (renderSpeechResult.outcome !== "rendered") {
		const isRetryable = renderSpeechResult.outcome === "retryable"
		throw new SpeechFailedError(`the speech call failed: ${renderSpeechResult.reason}`, isRetryable)
	}

	// record what the call cost before the audio is stored, so a failed upload still counts the paid call
	const { inputTokens, audioTokens } = renderSpeechResult
	await addPodcastEpisodeCost(podcastEpisodeId, speechCost({ speechTier, inputTokens, audioTokens }))

	// store the audio under the Podcast Episode's temporary chapter prefix
	const chapterKey = toPodcastEpisodeChapterKey(podcastEpisodeId, position)
	await uploadAttachment(chapterKey, renderSpeechResult.audioBytes, "audio/wav")
	return { position, chapterKey, byteSize: renderSpeechResult.audioBytes.byteLength }
}

/**
 * Joins the rendered chapters into one normalized MP3 on temporary files and stores it.
 * Returns the stored file with each chapter's times.
 */
export async function encodePodcastEpisode(
	podcastEpisodeId: string,
	renderedChapters: RenderedChapter[],
): Promise<EncodedPodcastEpisode> {
	// download the chapters in Podcast Episode order to a temporary directory that only this call uses
	const orderedChapters = renderedChapters.toSorted((first, second) => first.position - second.position)
	const temporaryDirectory = await mkdtemp(join(tmpdir(), "episode-"))
	try {
		const chapterPaths = orderedChapters.map((renderedChapter) =>
			join(temporaryDirectory, `${renderedChapter.position}.wav`),
		)
		await Promise.all(
			orderedChapters.map((renderedChapter, i) =>
				downloadPodcastEpisodeFile({ key: renderedChapter.chapterKey, filePath: chapterPaths[i] ?? "" }),
			),
		)

		// join, normalize, and encode in one ffmpeg pass that reads and writes files
		const audioPath = join(temporaryDirectory, "audio.mp3")
		await joinChapterFiles({ temporaryDirectory, chapterPaths, audioPath })

		// store the finished file
		const audioKey = toPodcastEpisodeAudioKey(podcastEpisodeId)
		await uploadPodcastEpisodeFile({ key: audioKey, filePath: audioPath, contentType: "audio/mpeg" })

		// the chapters' times and the Podcast Episode's length come from the rendered audio's byte sizes
		const chapterTimes = toChapterTimes(orderedChapters.map((renderedChapter) => renderedChapter.byteSize))
		return {
			audioKey,
			audioByteSize: Bun.file(audioPath).size,
			durationSeconds: Math.round(chapterTimes.at(-1)?.endSeconds ?? 0),
			chapterTimes,
		}
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true })
	}
}

/**
 * Returns where each chapter starts and ends, from the byte sizes of the chapters' WAV files in order.
 */
export function toChapterTimes(wavByteSizes: number[]): ChapterTime[] {
	let startSeconds = 0
	return wavByteSizes.map((wavByteSize) => {
		// a WAV file's length is its audio bytes divided by the bytes that one second takes
		const chapterSeconds = Math.max(0, wavByteSize - WAV_HEADER_BYTES) / SPEECH_BYTES_PER_SECOND
		const chapterTime = { startSeconds, endSeconds: startSeconds + chapterSeconds }
		startSeconds = chapterTime.endSeconds
		return chapterTime
	})
}

// one join. the temporary directory that it works in, the chapter files in order, and the file that it writes
export type JoinChapterFilesOptions = { temporaryDirectory: string; chapterPaths: string[]; audioPath: string }

/**
 * Runs ffmpeg's concat demuxer over the chapter files, normalizing the loudness and encoding the MP3.
 */
export async function joinChapterFiles({
	temporaryDirectory,
	chapterPaths,
	audioPath,
}: JoinChapterFilesOptions): Promise<void> {
	// the concat demuxer reads its inputs from a list file
	const chapterListPath = join(temporaryDirectory, "chapters.txt")
	await Bun.write(chapterListPath, chapterPaths.map((chapterPath) => `file '${chapterPath}'`).join("\n"))

	// normalize the loudness and encode one channel at the MP3's bitrate and sample rate, overwriting without a prompt
	const ffmpegArguments = [
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		"-f",
		"concat",
		"-safe",
		"0",
		"-i",
		chapterListPath,
	]
	const encodeArguments = ["-af", LOUDNESS_FILTER, "-ac", "1", "-ar", MP3_SAMPLE_RATE, "-c:a", "libmp3lame"]
	const ffmpegProcess = Bun.spawn(["ffmpeg", ...ffmpegArguments, ...encodeArguments, "-b:a", MP3_BITRATE, audioPath], {
		stdout: "ignore",
		stderr: "pipe",
	})

	// throw an error with ffmpeg's error text if the encode failed
	const [exitCode, errorText] = await Promise.all([ffmpegProcess.exited, new Response(ffmpegProcess.stderr).text()])
	if (exitCode !== 0) {
		throw new Error(`ffmpeg exited with ${exitCode}: ${errorText.trim().slice(0, 500)}`)
	}
}
