// the podcast episode lengths and findings limits, a cover's sizes and kind, the show and host names, and a turn's
// transcript text and speaker
import type { PodcastEpisodeTurn } from "./payloads"
import { toOneLineText } from "./text"

// the most minutes of talk that a full podcast episode and a short one may plan.
// a topic whose owner is on the free plan gets short podcast episodes
export const FULL_PODCAST_EPISODE_MINUTES = 30
export const SHORT_PODCAST_EPISODE_MINUTES = 10

// how many findings a full podcast episode and a short one narrate at most, about two minutes each
export const FULL_PODCAST_EPISODE_FINDINGS = 15
export const SHORT_PODCAST_EPISODE_FINDINGS = 5

// the pixel sizes that a cover is served at. the full size is the largest that Apple takes
export const FULL_PODCAST_COVER_SIZE = 3000
export const SMALL_PODCAST_COVER_SIZE = 600
export const PODCAST_COVER_SIZES = [FULL_PODCAST_COVER_SIZE, SMALL_PODCAST_COVER_SIZE] as const
export type PodcastCoverSize = (typeof PODCAST_COVER_SIZES)[number]

// a topic's show cover or a podcast episode's cover,
// with the id of that topic or episode and the title that the cover shows
export type PodcastCover = { kind: "show" | "episode"; id: string; title: string }

// the name that each speaker goes by in a transcript and in chat
export const PODCAST_EPISODE_SPEAKER_NAMES = { host: "Carl", cohost: "Vienna" } as const

// both hosts' names together, as the podcast's author credit
export const PODCAST_HOSTS_NAME = `${PODCAST_EPISODE_SPEAKER_NAMES.host} and ${PODCAST_EPISODE_SPEAKER_NAMES.cohost}`

// the sentence that tells a listener that the hosts are AI voices, without its period
export const AI_VOICES_NOTE = `${PODCAST_HOSTS_NAME} are AI voices`

// the podcast's name in the app's copy
export const PODCAST_NAME = "Coffee Break podcast"

// the podcast's name as a listener and a search engine read it
export const PODCAST_SHOW_NAME = `${PODCAST_NAME} with ${PODCAST_HOSTS_NAME}`

// the theme song that opens and closes every podcast episode, and the people credited for the song
export const PODCAST_THEME_SONG = {
	title: "Coffee Break",
	artist: "Chase Wimberly",
	youtubeUrl: "https://www.youtube.com/watch?v=S1-nYyIzK24",
	songwriter: "Laura Atkinson",
	copyrightYear: 2022,
	songwriterUrl: "http://pilgrimmusic.com/",
	producer: "Jimmy Deer",
	drummer: "Nate Barnes",
} as const

// the theme song's heading and credit lines, without their links
export const PODCAST_THEME_SONG_HEADING = `${PODCAST_THEME_SONG.title} Theme Song`
export const PODCAST_THEME_SONG_WRITING_LABEL = `Lyrics and melody © ${PODCAST_THEME_SONG.copyrightYear}`
export const PODCAST_THEME_SONG_WRITING_CREDIT = `${PODCAST_THEME_SONG_WRITING_LABEL} ${PODCAST_THEME_SONG.songwriter}`
export const PODCAST_THEME_SONG_PERFORMANCE_CREDIT = `Performed by ${PODCAST_THEME_SONG.artist}`
export const PODCAST_THEME_SONG_PRODUCTION_CREDIT = `Production by ${PODCAST_THEME_SONG.producer}`
export const PODCAST_THEME_SONG_DRUMMING_CREDIT = `Drumming by ${PODCAST_THEME_SONG.drummer}`

/**
 * Returns each host's speaker value as one sentence, as in Carl's lines have the speaker "host", for the prompts that
 * name them.
 */
export function toPodcastEpisodeSpeakersSentence(): string {
	const speakerClauses = Object.entries(PODCAST_EPISODE_SPEAKER_NAMES).map(
		([speaker, speakerName]) => `${speakerName}'s lines have the speaker "${speaker}"`,
	)
	return `${speakerClauses.join(", and ")}.`
}

/**
 * Returns a turn's text as it reads in a transcript, without the inline vocal tags that the speech model reads.
 */
export function toTranscriptText(turnText: string): string {
	return toOneLineText(turnText.replace(/<[^>]+>/g, " "))
}

/**
 * Returns a turn as it reads in a transcript: its speaker's name and its text without the vocal tags.
 */
export function toTranscriptTurn(turn: PodcastEpisodeTurn): { speakerName: string; text: string } {
	return { speakerName: PODCAST_EPISODE_SPEAKER_NAMES[turn.speaker], text: toTranscriptText(turn.text) }
}
