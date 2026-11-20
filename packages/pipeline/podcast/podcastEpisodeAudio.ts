// a Podcast Episode's audio. one speech call per chapter, written to object storage, then joined and encoded by ffmpeg.
// audio passes between activities only through object storage. each activity may run on another worker replica
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import {
	downloadPodcastEpisodeFile,
	loadStoredObjectByteSize,
	toPodcastEpisodeAudioKey,
	toPodcastEpisodeChapterKey,
	uploadAttachment,
	uploadPodcastEpisodeFile,
} from "@carlnotes/db/store"
import { type SpeechTier, speechCost } from "@carlnotes/models/budget"
import { runFfmpeg } from "@carlnotes/models/ffmpeg"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { recordSpeech, SPEECH_BYTES_PER_SECOND, WAV_HEADER_BYTES } from "@carlnotes/models/speech"
import { eq } from "drizzle-orm"
import { toChapterTurns } from "./podcastEpisodeScript"
import { loadThemeClips, type ThemeClips, toThemedEpisodeTimes, toThemeMix } from "./podcastEpisodeTheme"
import { assertPodcastPersonalSourcesConverted } from "./podcastPersonalSourcesMigration"
import { addPodcastEpisodeCost } from "./writePodcastEpisodeScript"

// the podcast loudness. -16 LUFS with a true peak of -1.5 dB, measured as mono
const LOUDNESS_FILTER = "loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true"

// the finished file. a 64 kbps mono MP3 at 44.1 kHz, about 14 MB for 30 minutes
const MP3_BITRATE = "64k"
const MP3_SAMPLE_RATE = "44100"

// one chapter's recording. the Podcast Episode, the user that the call bills, the chapter's position, and the speech tier
export type RecordPodcastEpisodeChapterOptions = {
	podcastEpisodeId: string
	billedUserId: string
	position: number
	speechTier: SpeechTier
}

// a recorded chapter. its position, where its audio is stored, and how many bytes the audio is
export type RecordedChapter = { position: number; chapterKey: string; byteSize: number }

// where a chapter starts and ends in the Podcast Episode's audio
export type ChapterTime = { startSeconds: number; endSeconds: number }

// the stored Podcast Episode audio. its key, its byte size, its length in seconds, and each chapter's times in order
export type EncodedPodcastEpisode = {
	audioKey: string
	audioByteSize: number
	durationSeconds: number
	chapterTimes: ChapterTime[]
}

// a speech call that recorded no audio, and whether another attempt can help
export class SpeechFailedError extends Error {
	constructor(
		message: string,
		readonly isRetryable: boolean,
	) {
		super(message)
	}
}

/**
 * Records one chapter as one two-speaker speech call on the billed user's key and writes its audio to object storage.
 * A chapter whose audio an earlier attempt stored is returned as it is, with no speech call and no cost. Throws a
 * SpeechFailedError if the call recorded no audio, or if the row is no longer recording.
 */
export async function recordPodcastEpisodeChapter({
	podcastEpisodeId,
	billedUserId,
	position,
	speechTier,
}: RecordPodcastEpisodeChapterOptions): Promise<RecordedChapter> {
	// read the row's status and the script saved on it. a row that failed or was removed while its workflow went on
	// records nothing more
	const [podcastEpisode] = await db
		.select({ status: podcastEpisodes.status, script: podcastEpisodes.script })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	if (podcastEpisode?.status !== "recording") {
		throw new SpeechFailedError(`episode ${podcastEpisodeId} is no longer recording`, false)
	}

	// the chapter's turns from the script
	const turns = podcastEpisode.script ? toChapterTurns(podcastEpisode.script)[position] : undefined
	if (!turns) {
		throw new SpeechFailedError(`episode ${podcastEpisodeId} has no chapter ${position} to record`, false)
	}

	// audio that an earlier attempt stored is the chapter, so a retry pays for no second speech call
	const chapterKey = toPodcastEpisodeChapterKey(podcastEpisodeId, position)
	const storedByteSize = await loadStoredObjectByteSize(chapterKey)
	if (storedByteSize !== null) {
		return { position, chapterKey, byteSize: storedByteSize }
	}

	// record the chapter's speech on the billed user's key. only a retryable failure is worth another attempt
	const litellmApiKey = await loadOrProvisionUserLiteLLMKey(billedUserId)
	await assertPodcastPersonalSourcesConverted({ podcastEpisodeId })
	const recordSpeechResult = await recordSpeech({ turns, speechTier, litellmApiKey })
	if (recordSpeechResult.outcome !== "recorded") {
		const isRetryable = recordSpeechResult.outcome === "retryable"
		throw new SpeechFailedError(`the speech call failed: ${recordSpeechResult.reason}`, isRetryable)
	}

	// record what the call cost before the audio is stored, so a failed upload still counts the paid call
	const { inputTokens, audioTokens } = recordSpeechResult
	await addPodcastEpisodeCost(podcastEpisodeId, speechCost({ speechTier, inputTokens, audioTokens }))

	// store the audio under the Podcast Episode's temporary chapter prefix
	await assertPodcastPersonalSourcesConverted({ podcastEpisodeId })
	await uploadAttachment(chapterKey, recordSpeechResult.audioBytes, "audio/wav")
	return { position, chapterKey, byteSize: recordSpeechResult.audioBytes.byteLength }
}

/**
 * Joins the recorded chapters into one normalized MP3 on temporary files and stores it.
 * Returns the stored file with each chapter's times. An aborted signal stops the downloads, the join, and the upload.
 */
export async function encodePodcastEpisode(
	podcastEpisodeId: string,
	recordedChapters: RecordedChapter[],
	signal?: AbortSignal,
): Promise<EncodedPodcastEpisode> {
	// download the chapters in Podcast Episode order to a temporary directory that only this call uses
	await assertPodcastPersonalSourcesConverted({ podcastEpisodeId })
	const orderedChapters = recordedChapters.toSorted((first, second) => first.position - second.position)
	const temporaryDirectory = await mkdtemp(join(tmpdir(), "episode-"))
	try {
		const chapterPaths = orderedChapters.map((recordedChapter) =>
			join(temporaryDirectory, `${recordedChapter.position}.wav`),
		)
		await Promise.all(
			orderedChapters.map((recordedChapter, i) =>
				downloadPodcastEpisodeFile({ key: recordedChapter.chapterKey, filePath: chapterPaths[i] ?? "", signal }),
			),
		)

		// the talk's chapter times from the chapters' byte sizes, which place the outro, and the theme clips on disk
		const speechChapterTimes = toChapterTimes(orderedChapters.map((recordedChapter) => recordedChapter.byteSize))
		const speechSeconds = speechChapterTimes.at(-1)?.endSeconds ?? 0
		const themeClips = await loadThemeClips()

		// join, mix in the theme, normalize, and encode in one ffmpeg pass that reads and writes files
		const audioPath = join(temporaryDirectory, "audio.mp3")
		await joinChapterFiles({ temporaryDirectory, chapterPaths, audioPath, themeClips, speechSeconds, signal })

		// store the finished file
		const audioKey = toPodcastEpisodeAudioKey(podcastEpisodeId)
		await uploadPodcastEpisodeFile({ key: audioKey, filePath: audioPath, contentType: "audio/mpeg", signal })

		// the chapters' times shifted by the intro's lead, and the Podcast Episode's length with the outro's tail
		const { chapterTimes, durationSeconds } = toThemedEpisodeTimes(speechChapterTimes, themeClips)
		return {
			audioKey,
			audioByteSize: Bun.file(audioPath).size,
			durationSeconds: Math.round(durationSeconds),
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

// how long the join may run before it is killed. a full podcast episode's join took under two minutes on one core
const AUDIO_JOIN_TIMEOUT_MS = 8 * 60 * 1000

// one join. the temporary directory that the join works in, the chapter files in order, the file that the join writes,
// the theme clips that exist, the talk's length that places the outro, whether the theme is mixed in, which a
// Podcast Episode does and a Topic Post Discussion does not, and a signal that kills the join once it aborts
export type JoinChapterFilesOptions = {
	temporaryDirectory: string
	chapterPaths: string[]
	audioPath: string
	// what the join mixes in, and what stops it
	themeClips: ThemeClips
	speechSeconds: number
	hasThemeMix?: boolean
	signal?: AbortSignal
}

/**
 * Runs ffmpeg's concat demuxer over the chapter files, mixing in the theme clips, normalizing the loudness,
 * and encoding the MP3. The join is killed after eight minutes or once the signal aborts.
 */
export async function joinChapterFiles({
	temporaryDirectory,
	chapterPaths,
	audioPath,
	themeClips,
	speechSeconds,
	hasThemeMix,
	signal,
}: JoinChapterFilesOptions): Promise<void> {
	// the concat demuxer reads its inputs from a list file
	const chapterListPath = join(temporaryDirectory, "chapters.txt")
	await Bun.write(chapterListPath, chapterPaths.map((chapterPath) => `file '${chapterPath}'`).join("\n"))

	// run ffmpeg over the chapters and the theme clips, which writes the MP3 at the audio path
	const joinArguments = toJoinArguments({ chapterListPath, audioPath, themeClips, speechSeconds, hasThemeMix })
	await runFfmpeg({ ffmpegArguments: joinArguments, timeoutMs: AUDIO_JOIN_TIMEOUT_MS, signal })
}

// one join's arguments: the join's own options, with the chapters' list file in place of the chapter files
type ToJoinArgumentsOptions = Omit<JoinChapterFilesOptions, "temporaryDirectory" | "chapterPaths"> & {
	chapterListPath: string
}

/**
 * Returns ffmpeg's arguments for one join: the chapters through the concat demuxer, the theme clips if the theme is
 * mixed in and any exist, the loudness filter, and the encode of one channel at the MP3's bitrate and sample rate.
 */
export function toJoinArguments({
	chapterListPath,
	audioPath,
	themeClips,
	speechSeconds,
	hasThemeMix = true,
}: ToJoinArgumentsOptions): string[] {
	// read the chapters through the concat demuxer, and overwrite the output without a prompt
	const chapterArguments = ["-y", "-f", "concat", "-safe", "0", "-i", chapterListPath]
	const encodeArguments = ["-ac", "1", "-ar", MP3_SAMPLE_RATE, "-c:a", "libmp3lame", "-b:a", MP3_BITRATE, audioPath]

	// with the theme mix off, or with no theme clip, normalize the talk alone
	if (!hasThemeMix || (!themeClips.intro && !themeClips.outro)) {
		return [...chapterArguments, "-af", LOUDNESS_FILTER, ...encodeArguments]
	}

	// otherwise mix the clips under the talk, normalize the mix, and encode the mix
	const themeMix = toThemeMix({ themeClips, speechSeconds, loudnessFilter: LOUDNESS_FILTER })
	return [
		...chapterArguments,
		...themeMix.inputArguments,
		"-filter_complex",
		themeMix.filterGraph,
		"-map",
		"[mixed]",
		...encodeArguments,
	]
}
