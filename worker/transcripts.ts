// fetch a transcript as plain text: a video's caption track from the host that publishes it, or a declared transcript
import { toOneLineText } from "@shared/text"
import { FetchStatusError, fetchPublicUrl, readLimitedBody } from "./publicFetch"
import type { FetchResult } from "./scrape"

// how long a request to a video host may run before it aborts
const VIDEO_HOST_TIMEOUT_MS = 30_000

// a body read straight from its url is bounded by its own timeout
const DIRECT_TIMEOUT_MS = 10_000

// the YouTube hostnames a video url can have, with watch pages and short links kept apart
const YOUTUBE_WATCH_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"])
const YOUTUBE_SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"])

// the paths that name the video in their next segment instead of in a "v" param
const YOUTUBE_ID_PATHS = new Set(["shorts", "embed", "live"])

// the endpoint that lists a YouTube video's caption tracks, and the domain its tracks are served from
const PLAYER_ENDPOINT = "https://www.youtube.com/youtubei/v1/player"
const YOUTUBE_CAPTION_DOMAIN = "youtube.com"

// the client the track list is requested as
const PLAYER_CLIENT = { clientName: "IOS", clientVersion: "20.10.4", deviceModel: "iPhone16,2" }

// the Vimeo hostnames a video url can have, and the domain its caption files are served from
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"])
const VIMEO_CAPTION_DOMAIN = "vimeo.com"

// the Dailymotion hostnames a video url can have, and the cdn domain its subtitle files are served from
const DAILYMOTION_HOSTS = new Set(["dailymotion.com", "www.dailymotion.com"])
const DAILYMOTION_SHORT_HOSTS = new Set(["dai.ly", "www.dai.ly"])
const DAILYMOTION_CAPTION_DOMAIN = "dmcdn.net"

// one caption track, however the host that published it, described its own payload
export type CaptionTrack = { languageCode: string; url: string }

// the hosts that publish a video's captions without a key
export const CAPTION_HOSTS = [
	{ toVideoId: toYoutubeVideoId, fetchTranscript: fetchYoutubeTranscript },
	{ toVideoId: toVimeoVideoId, fetchTranscript: fetchVimeoTranscript },
	{ toVideoId: toDailymotionVideoId, fetchTranscript: fetchDailymotionTranscript },
]

/**
 * Reads the transcript a publisher declared for its own episode, which podcast feeds publish as WEBVTT or SRT.
 */
export async function fetchDeclaredTranscript(transcriptUrl: string): Promise<FetchResult> {
	const response = await fetchPublicUrl(transcriptUrl, { signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS) })
	if (!response.ok) {
		throw new FetchStatusError(`transcript ${transcriptUrl}`, response.status)
	}

	// the same cue parser the caption tracks use, in the same two formats
	const text = toCueText(await readLimitedBody(response, transcriptUrl))
	if (!text) {
		throw new Error(`transcript ${transcriptUrl} is empty`)
	}
	return { text, cost: 0, etag: null, lastModified: null, title: null, faviconUrl: null }
}

// fetch a video's published caption track as plain text
async function fetchYoutubeTranscript(videoId: string): Promise<FetchResult> {
	// ask the player endpoint which caption tracks the video publishes. it needs no key, only a client to answer as
	const playerResponse = await fetch(PLAYER_ENDPOINT, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ videoId, context: { client: PLAYER_CLIENT } }),
		signal: AbortSignal.timeout(VIDEO_HOST_TIMEOUT_MS),
	})
	if (!playerResponse.ok) {
		throw new FetchStatusError(`youtube player ${videoId}`, playerResponse.status)
	}

	// the track url comes back from a remote payload instead of being composed here, so only YouTube's own domain is followed
	const tracks = toYoutubeCaptionTracks((await playerResponse.json()) as PlayerPayload)
	const track = toCaptionTrack(tracks, YOUTUBE_CAPTION_DOMAIN, `youtube video ${videoId}`)

	// ask for json3 so the transcript needs no XML parsing. the format is set instead of appended, because the url has its own
	const captionUrl = new URL(track.url)
	captionUrl.searchParams.set("fmt", "json3")
	const captionResponse = await fetch(captionUrl, { signal: AbortSignal.timeout(VIDEO_HOST_TIMEOUT_MS) })
	if (!captionResponse.ok) {
		throw new FetchStatusError(`youtube caption track for ${videoId}`, captionResponse.status)
	}

	// a transcript that joins to nothing is a failed fetch
	const text = toTranscriptText((await captionResponse.json()) as CaptionEvents)
	if (!text) {
		throw new Error(`youtube caption track for ${videoId} is empty`)
	}
	return { text, cost: 0, etag: null, lastModified: null, title: null, faviconUrl: null }
}

// fetch a Vimeo video's published captions
async function fetchVimeoTranscript(videoId: string): Promise<FetchResult> {
	// the player config lists the text tracks the video publishes
	const configResponse = await fetch(`https://player.vimeo.com/video/${videoId}/config`, {
		signal: AbortSignal.timeout(VIDEO_HOST_TIMEOUT_MS),
	})
	if (!configResponse.ok) {
		throw new FetchStatusError(`vimeo config ${videoId}`, configResponse.status)
	}

	// the tracks are served as WEBVTT from Vimeo's caption domain
	const tracks = toVimeoCaptionTracks((await configResponse.json()) as VimeoConfig)
	return fetchCueTrack(tracks, VIMEO_CAPTION_DOMAIN, `vimeo video ${videoId}`)
}

// fetch a Dailymotion video's published subtitles
async function fetchDailymotionTranscript(videoId: string): Promise<FetchResult> {
	// the player metadata lists the subtitle tracks, keyed by language
	const metadataResponse = await fetch(`https://www.dailymotion.com/player/metadata/video/${videoId}`, {
		signal: AbortSignal.timeout(VIDEO_HOST_TIMEOUT_MS),
	})
	if (!metadataResponse.ok) {
		throw new FetchStatusError(`dailymotion metadata ${videoId}`, metadataResponse.status)
	}

	// the tracks are served as SRT from Dailymotion's cdn
	const tracks = toDailymotionCaptionTracks((await metadataResponse.json()) as DailymotionMetadata)
	return fetchCueTrack(tracks, DAILYMOTION_CAPTION_DOMAIN, `dailymotion video ${videoId}`)
}

// fetch a cue-file caption track and join it to plain text
async function fetchCueTrack(tracks: CaptionTrack[], captionDomain: string, label: string): Promise<FetchResult> {
	// select the track and reject a url pointing anywhere but the host's own caption domain
	const track = toCaptionTrack(tracks, captionDomain, label)
	const trackResponse = await fetch(track.url, { signal: AbortSignal.timeout(VIDEO_HOST_TIMEOUT_MS) })
	if (!trackResponse.ok) {
		throw new FetchStatusError(`${label} caption track`, trackResponse.status)
	}

	// a transcript that joins to nothing is a failed fetch. a cue file has no validators, so etag and lastModified stay null
	const text = toCueText(await trackResponse.text())
	if (!text) {
		throw new Error(`${label} caption track is empty`)
	}
	return { text, cost: 0, etag: null, lastModified: null, title: null, faviconUrl: null }
}

// the track to fetch, preferring English
function toCaptionTrack(tracks: CaptionTrack[], captionDomain: string, label: string): CaptionTrack {
	// the tracks come back in the host's own order instead of preference order, so English is selected out by hand
	const englishTrack = tracks.find((track) => track.languageCode.toLowerCase().startsWith("en"))
	const track = englishTrack ?? tracks[0]
	if (!track) {
		throw new Error(`${label} publishes no caption track`)
	}

	// a url outside the caption domain is one this code did not compose, so it is never followed
	if (!isUrlWithinDomain(track.url, captionDomain)) {
		throw new Error(`${label} names a caption url outside ${captionDomain}: ${track.url}`)
	}
	return track
}

// whether an https url points at the domain or one of its subdomains
function isUrlWithinDomain(url: string, domain: string): boolean {
	// a url that will not parse, or one that is not https, is never followed
	const parsedUrl = URL.parse(url)
	if (parsedUrl?.protocol !== "https:") {
		return false
	}
	return parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
}

/**
 * The video id a YouTube url names, however it addresses the video. Null for any other url and for one that will not parse.
 */
export function toYoutubeVideoId(url: string): string | null {
	// an unparseable url has no host to match, so it is not a video
	const parsedUrl = URL.parse(url)
	if (!parsedUrl) {
		return null
	}

	// a short link has the id as its only path segment, and anything off a YouTube host is not a video at all
	if (YOUTUBE_SHORT_HOSTS.has(parsedUrl.hostname)) {
		return parsedUrl.pathname.split("/")[1] || null
	}
	if (!YOUTUBE_WATCH_HOSTS.has(parsedUrl.hostname)) {
		return null
	}

	// a watch page has the id in the "v" param. a short, an embed, and a live replay have it after the path that names them
	const [, firstSegment, secondSegment] = parsedUrl.pathname.split("/")
	if (firstSegment === "watch") {
		return parsedUrl.searchParams.get("v")
	}
	return YOUTUBE_ID_PATHS.has(firstSegment ?? "") ? secondSegment || null : null
}

/**
 * The video id a Vimeo url names. Null for any other url and for one that will not parse.
 */
export function toVimeoVideoId(url: string): string | null {
	// an unparseable url has no host to match, so it is not a video
	const parsedUrl = URL.parse(url)
	if (!parsedUrl || !VIMEO_HOSTS.has(parsedUrl.hostname)) {
		return null
	}

	// a Vimeo id is all digits, and it is the last such segment whether the url is a plain link, a channel or group
	const digitSegments = parsedUrl.pathname.split("/").filter((segment) => /^\d+$/.test(segment))
	return digitSegments.at(-1) ?? null
}

/**
 * The video id a Dailymotion url names. Null for any other url and for one that will not parse.
 */
export function toDailymotionVideoId(url: string): string | null {
	// an unparseable url has no host to match, so it is not a video
	const parsedUrl = URL.parse(url)
	if (!parsedUrl) {
		return null
	}

	// a dai.ly short link has the id as its first path segment, and a full link has it after /video
	const [, firstSegment, secondSegment] = parsedUrl.pathname.split("/")
	if (DAILYMOTION_SHORT_HOSTS.has(parsedUrl.hostname)) {
		return toDailymotionId(firstSegment)
	}
	return DAILYMOTION_HOSTS.has(parsedUrl.hostname) && firstSegment === "video" ? toDailymotionId(secondSegment) : null
}

// a Dailymotion path segment as a bare video id, dropping any title slug that follows an underscore
function toDailymotionId(segment: string | undefined): string | null {
	return segment?.split("_")[0] || null
}

// the track list the YouTube player endpoint returns. every field is optional because the JSON is unvalidated
type PlayerPayload = {
	captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: { baseUrl?: string; languageCode?: string }[] } }
}

/**
 * The caption tracks a YouTube player payload publishes, in the order it listed them.
 */
export function toYoutubeCaptionTracks(player: PlayerPayload | null): CaptionTrack[] {
	// a video with no captions has no track list, and a track with no url is nothing to fetch
	const captionTracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
	return toCaptionTracks(captionTracks.map((track) => ({ languageCode: track.languageCode, url: track.baseUrl })))
}

// the text track list the Vimeo player config returns. every field is optional because the JSON is unvalidated
type VimeoConfig = { request?: { text_tracks?: { lang?: string; url?: string }[] } }

/**
 * The caption tracks a Vimeo player config publishes, in the order it listed them.
 */
export function toVimeoCaptionTracks(config: VimeoConfig | null): CaptionTrack[] {
	// a video with no captions has no track list, and a track with no url is nothing to fetch
	const textTracks = config?.request?.text_tracks ?? []
	return toCaptionTracks(textTracks.map((track) => ({ languageCode: track.lang, url: track.url })))
}

// the subtitle map the Dailymotion player metadata returns. every field is optional because the JSON is unvalidated
type DailymotionMetadata = { subtitles?: { data?: Record<string, { urls?: string[] } | undefined> } }

/**
 * The caption tracks a Dailymotion player metadata payload publishes, keyed in its own language order.
 */
export function toDailymotionCaptionTracks(metadata: DailymotionMetadata | null): CaptionTrack[] {
	// the subtitle map is keyed by language, and each entry holds its own urls
	const subtitleEntries = Object.entries(metadata?.subtitles?.data ?? {})
	return toCaptionTracks(
		subtitleEntries.map(([language, entry]) => ({ languageCode: language, url: entry?.urls?.[0] })),
	)
}

// drop the tracks a host listed without a url and fill in a missing language so the English preference can read it
function toCaptionTracks(tracks: { languageCode?: string; url?: string }[]): CaptionTrack[] {
	return tracks
		.filter((track) => Boolean(track.url))
		.map((track) => ({ languageCode: track.languageCode ?? "", url: track.url ?? "" }))
}

// the fields toTranscriptText reads from a json3 caption response. every field is optional because the JSON is unvalidated
type CaptionEvents = { events?: { segs?: { utf8?: string }[] }[] }

/**
 * The spoken text of a json3 caption response, joined into one line of plain prose.
 */
export function toTranscriptText(captions: CaptionEvents | null): string {
	// an event is one caption line, and its segments are the words within that line
	const captionLines = (captions?.events ?? []).map((event) =>
		(event.segs ?? []).map((segment) => segment.utf8 ?? "").join(""),
	)
	return toOneLineText(captionLines.join(" "))
}

/**
 * The spoken text of a WEBVTT or SRT caption file, joined into one line of plain prose.
 */
export function toCueText(cueFile: string): string {
	// a cue file is blocks of an optional cue number, a timing line, then the words
	const spokenLines = cueFile.split(/\r?\n/).filter(isSpokenLine)

	// WEBVTT marks up speakers and emphasis inline, which would otherwise reach a model as markup
	return toOneLineText(spokenLines.join(" ").replace(/<[^>]*>/g, " "))
}

// whether a cue-file line is words instead of the file header, a note, a cue number, or a cue's timing
function isSpokenLine(line: string): boolean {
	// the header and note blocks open a cue file and annotate it, and neither is spoken
	const cueLine = line.trim()
	if (!cueLine || cueLine.startsWith("WEBVTT") || cueLine.startsWith("NOTE")) {
		return false
	}

	// a timing line holds the arrow, and a cue number is digits alone
	return !cueLine.includes("-->") && !/^\d+$/.test(cueLine)
}
