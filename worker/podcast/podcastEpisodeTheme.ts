// the Coffee Break theme: the intro and outro clips cut from the theme song, and how each mixes under the talk
import { fileURLToPath } from "node:url"
import { WAV_HEADER_BYTES } from "../speech"
import type { ChapterTime } from "./podcastEpisodeAudio"

// the clips beside the worker's code, each 44.1 kHz mono 16-bit with a plain WAV header
const THEME_INTRO_PATH = fileURLToPath(new URL("../assets/podcast/theme-intro.wav", import.meta.url))
const THEME_OUTRO_PATH = fileURLToPath(new URL("../assets/podcast/theme-outro.wav", import.meta.url))
const THEME_CLIP_BYTES_PER_SECOND = 44_100 * 2

// the sample rate that the talk and the music mix at, the MP3's own
const THEME_MIX_SAMPLE_RATE = 44_100

// how the intro opens the episode, in seconds: its fade in, the lead before the cold open starts,
// the ramp down to the duck that ends as the cold open starts, and the fade out over the intro's last seconds
const THEME_FADE_IN_SECONDS = 2
const THEME_LEAD_SECONDS = 40
const THEME_DUCK_RAMP_SECONDS = 1
const THEME_FADE_OUT_SECONDS = 8

// the music's level under the talk, in decibels
const THEME_DUCK_DECIBELS = -18

// how the outro closes the episode, in seconds: how long the outro plays under the last words,
// and its rise to full volume after the last word
const THEME_OUTRO_OVERLAP_SECONDS = 20
const THEME_RISE_SECONDS = 2

// a theme clip on disk and its length
export type ThemeClip = { path: string; seconds: number }

// the theme clips that exist on disk, each null if its file is missing
export type ThemeClips = { intro: ThemeClip | null; outro: ThemeClip | null }

// the theme clips, the joined talk's length that places the outro, and the loudness filter that ends the mix
type ThemeMixOptions = { themeClips: ThemeClips; speechSeconds: number; loudnessFilter: string }

// the episode's chapter times and its length once the theme is mixed in
type ThemedEpisodeTimes = { chapterTimes: ChapterTime[]; durationSeconds: number }

// the ffmpeg inputs after the talk's, and the filter graph that mixes the clips under the talk
type ThemeMix = { inputArguments: string[]; filterGraph: string }

/**
 * Loads the theme clips that exist on disk, with each clip's length.
 */
export async function loadThemeClips(): Promise<ThemeClips> {
	const [intro, outro] = await Promise.all([loadThemeClip(THEME_INTRO_PATH), loadThemeClip(THEME_OUTRO_PATH)])
	return { intro, outro }
}

/**
 * Returns the chapter times shifted by the intro's lead, and the episode's length with the outro's tail.
 */
export function toThemedEpisodeTimes(chapterTimes: ChapterTime[], themeClips: ThemeClips): ThemedEpisodeTimes {
	// the talk starts after the intro's lead, so every chapter shifts by the lead
	const leadSeconds = themeClips.intro ? THEME_LEAD_SECONDS : 0
	const shiftedChapterTimes = chapterTimes.map((chapterTime) => ({
		startSeconds: chapterTime.startSeconds + leadSeconds,
		endSeconds: chapterTime.endSeconds + leadSeconds,
	}))

	// the episode ends at the last word, the outro's end, or the intro's end, whichever comes last
	const speechSeconds = chapterTimes.at(-1)?.endSeconds ?? 0
	const lastWordSeconds = leadSeconds + speechSeconds
	const outroEndSeconds = themeClips.outro ? toOutroStartSeconds(lastWordSeconds) + themeClips.outro.seconds : 0
	const durationSeconds = Math.max(lastWordSeconds, outroEndSeconds, themeClips.intro?.seconds ?? 0)
	return { chapterTimes: shiftedChapterTimes, durationSeconds }
}

/**
 * Returns the clips to add as ffmpeg inputs after the talk, and the filter graph that mixes the clips at 44.1 kHz,
 * then normalizes the mix with the loudness filter into the [mixed] output.
 */
export function toThemeMix({ themeClips, speechSeconds, loudnessFilter }: ThemeMixOptions): ThemeMix {
	// the talk, resampled to the mix's rate and delayed by the intro's lead
	const leadSeconds = themeClips.intro ? THEME_LEAD_SECONDS : 0
	const talkDelay = leadSeconds > 0 ? `,adelay=${toMilliseconds(leadSeconds)}:all=1` : ""
	const filterChains = [`[0:a]aresample=${THEME_MIX_SAMPLE_RATE}${talkDelay}[talk]`]
	const mixLabels = ["[talk]"]
	const inputArguments: string[] = []

	// the intro fades in, ducks as the cold open starts, and fades out over its last seconds
	if (themeClips.intro) {
		const introInputIndex = mixLabels.length
		inputArguments.push("-i", themeClips.intro.path)
		const introFadeOutStart = Math.max(0, themeClips.intro.seconds - THEME_FADE_OUT_SECONDS)
		filterChains.push(
			`[${introInputIndex}:a]afade=t=in:d=${THEME_FADE_IN_SECONDS},${toIntroVolumeFilter()},afade=t=out:st=${introFadeOutStart}:d=${THEME_FADE_OUT_SECONDS}[intro]`,
		)
		mixLabels.push("[intro]")
	}

	// the outro plays ducked under the last words, rises after the last word, and starts where the outro overlaps the talk
	if (themeClips.outro) {
		const outroInputIndex = mixLabels.length
		inputArguments.push("-i", themeClips.outro.path)
		const lastWordSeconds = leadSeconds + speechSeconds
		const outroStartSeconds = toOutroStartSeconds(lastWordSeconds)
		filterChains.push(
			`[${outroInputIndex}:a]${toOutroVolumeFilter(lastWordSeconds - outroStartSeconds)},adelay=${toMilliseconds(outroStartSeconds)}:all=1[outro]`,
		)
		mixLabels.push("[outro]")
	}

	// add the streams at their own levels, then normalize the whole mix
	filterChains.push(
		`${mixLabels.join("")}amix=inputs=${mixLabels.length}:normalize=0:duration=longest,${loudnessFilter}[mixed]`,
	)
	return { inputArguments, filterGraph: filterChains.join(";") }
}

// a clip's length from its audio bytes, or null if its file is missing
async function loadThemeClip(path: string): Promise<ThemeClip | null> {
	const clipFile = Bun.file(path)
	if (!(await clipFile.exists())) {
		return null
	}
	return { path, seconds: Math.max(0, clipFile.size - WAV_HEADER_BYTES) / THEME_CLIP_BYTES_PER_SECOND }
}

// where the outro starts: its overlap before the last word, and never before the episode starts
function toOutroStartSeconds(lastWordSeconds: number): number {
	return Math.max(0, lastWordSeconds - THEME_OUTRO_OVERLAP_SECONDS)
}

// the intro's level: full until the duck's ramp, down the ramp as the cold open nears, then ducked
function toIntroVolumeFilter(): string {
	const duckGain = toDuckGain()
	const rampStart = THEME_LEAD_SECONDS - THEME_DUCK_RAMP_SECONDS
	const rampLevel = `1-(1-${duckGain})*(t-${rampStart})/${THEME_DUCK_RAMP_SECONDS}`
	return `volume='if(lt(t,${rampStart}),1,if(lt(t,${THEME_LEAD_SECONDS}),${rampLevel},${duckGain}))':eval=frame`
}

// the outro's level: ducked until the last word at its own time, up the rise, then full
function toOutroVolumeFilter(lastWordSeconds: number): string {
	const duckGain = toDuckGain()
	const riseEnd = lastWordSeconds + THEME_RISE_SECONDS
	const riseLevel = `${duckGain}+(1-${duckGain})*(t-${lastWordSeconds})/${THEME_RISE_SECONDS}`
	return `volume='if(lt(t,${lastWordSeconds}),${duckGain},if(lt(t,${riseEnd}),${riseLevel},1))':eval=frame`
}

// the duck as a gain that a volume filter multiplies by
function toDuckGain(): string {
	return (10 ** (THEME_DUCK_DECIBELS / 20)).toFixed(4)
}

// seconds as the whole milliseconds that adelay takes
function toMilliseconds(seconds: number): number {
	return Math.round(seconds * 1000)
}
