// the podcast episode speech model, a cover's key and path, the show and host names, and a turn's transcript text

// the Gemini speech model that episodes render with.
// PODCAST_SPEECH_MODEL names another model, and an empty value turns podcast episodes off
const DEFAULT_PODCAST_SPEECH_MODEL = "gemini-3.8-flash-tts"

/**
 * Returns the Gemini speech model that episodes render with, or null if PODCAST_SPEECH_MODEL is set empty.
 */
export function podcastEpisodeSpeechModel(): string | null {
	return (Bun.env.PODCAST_SPEECH_MODEL ?? DEFAULT_PODCAST_SPEECH_MODEL).trim() || null
}

/**
 * Whether a speech model is set, which podcast episode rendering requires.
 */
export function isPodcastEpisodeRenderingConfigured(): boolean {
	return podcastEpisodeSpeechModel() !== null
}

// the pixel sizes that a cover is served at
export const PODCAST_COVER_SIZES = [3000, 600] as const
export type PodcastCoverSize = (typeof PODCAST_COVER_SIZES)[number]

// a topic's show cover or a podcast episode's cover,
// with the id of that topic or episode and the title that the cover shows
export type PodcastCover = { kind: "show" | "episode"; id: string; title: string }

/**
 * Returns a cover's key, an HMAC of its kind, id, and title under the app's auth secret. A new title makes a new key.
 */
export function toPodcastCoverKey({ kind, id, title }: PodcastCover): string {
	// key the hash with the app's auth secret, so that only the app can compute a cover's url
	const secret = Bun.env.BETTER_AUTH_SECRET
	if (!secret) {
		throw new Error("BETTER_AUTH_SECRET must be set to sign podcast cover urls")
	}
	const coverHash = new Bun.CryptoHasher("sha256", secret).update(JSON.stringify([kind, id, title])).digest("hex")
	return coverHash.slice(0, 32)
}

/**
 * Returns the path that a cover is served at in the given size.
 */
export function toPodcastCoverPath(podcastCover: PodcastCover, size: PodcastCoverSize): string {
	return `/api/podcast-covers/${podcastCover.kind}/${podcastCover.id}/${toPodcastCoverKey(podcastCover)}-${size}.jpg`
}

// the sentence that tells a listener that the hosts are AI voices, without its period
export const AI_VOICES_NOTE = "Carl and Vienna are AI voices"

// the podcast's name in the app's copy
export const PODCAST_NAME = "Coffee Break podcast"

// the podcast's name as a listener and a search engine read it
export const PODCAST_SHOW_NAME = `${PODCAST_NAME} with Carl and Vienna`

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

// the name that each speaker goes by in a transcript
export const PODCAST_EPISODE_SPEAKER_NAMES = { host: "Carl", cohost: "Vienna" } as const

/**
 * Returns a turn's text as it reads in a transcript, without the inline vocal tags that the speech model reads.
 */
export function toTranscriptText(turnText: string): string {
	return turnText
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim()
}
