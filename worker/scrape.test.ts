// scrape tests for the conditional-refetch helpers and the caption-track parsing of every host that publishes one
import { expect, test } from "bun:test"
import {
	conditionalHeaders,
	fetchContent,
	fetchPublicUrl,
	revalidationOutcome,
	toCueText,
	toDailymotionCaptionTracks,
	toDailymotionVideoId,
	toFetchableUrl,
	toTranscriptText,
	toVimeoCaptionTracks,
	toVimeoVideoId,
	toYoutubeCaptionTracks,
	toYoutubeVideoId,
} from "./scrape"

// one track as the YouTube player endpoint lists it, and the two renderers it nests the list under
type YoutubeTrack = { baseUrl?: string; languageCode?: string }
type PlayerPayload = { captions: { playerCaptionsTracklistRenderer: { captionTracks: YoutubeTrack[] } } }

// wrap a track list in the shape the YouTube player endpoint returns it in
function toPlayerPayload(captionTracks: YoutubeTrack[]): PlayerPayload {
	return { captions: { playerCaptionsTracklistRenderer: { captionTracks } } }
}

// conditionalHeaders sends only the validators that are stored, omitting an absent one
test("conditionalHeaders builds from whichever validators are stored", () => {
	// test only the etag, only the last-modified date, both, and neither headers are built
	expect(conditionalHeaders({ etag: '"abc"', lastModified: null })).toEqual({ "If-None-Match": '"abc"' })
	expect(conditionalHeaders({ etag: null, lastModified: "Wed, 21 Oct 2026 07:28:00 GMT" })).toEqual({
		"If-Modified-Since": "Wed, 21 Oct 2026 07:28:00 GMT",
	})
	expect(conditionalHeaders({ etag: '"abc"', lastModified: "Wed, 21 Oct 2026 07:28:00 GMT" })).toEqual({
		"If-None-Match": '"abc"',
		"If-Modified-Since": "Wed, 21 Oct 2026 07:28:00 GMT",
	})
	expect(conditionalHeaders({ etag: null, lastModified: null })).toEqual({})
})

// only a 304 means the stored content still stands. any other status is a change to refetch
test("revalidationOutcome maps 304 to not-modified and anything else to changed", () => {
	expect(revalidationOutcome(304)).toBe("not-modified")
	expect(revalidationOutcome(200)).toBe("changed")
	expect(revalidationOutcome(500)).toBe("changed")
})

// a Source or attachment url is owner-supplied, so the guard is what stops a Topic from reaching an internal address
test("toFetchableUrl rejects an internal url", () => {
	// a public https url passes through as a parsed target
	expect(toFetchableUrl("https://example.com/feed.xml").hostname).toBe("example.com")

	// a scheme that is not http(s) reaches the filesystem or inline data, so it never gets fetched
	expect(() => toFetchableUrl("file:///etc/passwd")).toThrow(/http/)
	expect(() => toFetchableUrl("not a url")).toThrow(/malformed/)

	// loopback, link-local (the cloud metadata address), and the private ranges are all rejected
	for (const url of [
		"http://localhost/admin",
		"http://127.0.0.1/admin",
		"http://169.254.169.254/latest/meta-data/",
		"http://10.0.0.5/",
		"http://192.168.1.1/",
		"http://172.16.0.1/",
		"http://db.internal/",
	]) {
		expect(() => toFetchableUrl(url)).toThrow(/is an internal address/)
	}
})

// a public page that redirects inward must not call fetch on it. the first url is the only one fetch itself checks
test("fetchPublicUrl checks every redirect hop, not just the first url", async () => {
	// stand in for the network so the test never leaves the machine. each url responds the way the case under test needs
	const originalFetch = globalThis.fetch
	const requestedUrls: string[] = []
	globalThis.fetch = (async (input: string | URL | Request) => {
		const url = input.toString()
		requestedUrls.push(url)
		// one url bounces to an internal address, one moves to another public page, and anything else is the landing page
		if (url.startsWith("https://public.example/bounce")) {
			return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } })
		}
		if (url.startsWith("https://public.example/moved")) {
			return new Response(null, { status: 301, headers: { location: "https://public.example/landed" } })
		}
		return new Response("public body")
	}) as typeof fetch

	try {
		// a page that redirects inward throws an error, and the internal address is never requested
		await expect(fetchPublicUrl("https://public.example/bounce")).rejects.toThrow(/is an internal address/)
		expect(requestedUrls).not.toContain("http://169.254.169.254/latest/meta-data")

		// a redirect to another public page is still followed, so ordinary moved feeds keep working
		const response = await fetchPublicUrl("https://public.example/moved")
		expect(await response.text()).toBe("public body")
		expect(requestedUrls).toContain("https://public.example/landed")
	} finally {
		globalThis.fetch = originalFetch
	}
})

// only a YouTube video url takes the transcript path, so everything else has to come back null
test("toYoutubeVideoId reads the id from a watch url and a short link only", () => {
	// a watch page on any YouTube host has the id in the v param, and extra params do not disturb it
	expect(toYoutubeVideoId("https://www.youtube.com/watch?v=abc123")).toBe("abc123")
	expect(toYoutubeVideoId("https://m.youtube.com/watch?v=abc123")).toBe("abc123")
	expect(toYoutubeVideoId("https://www.youtube.com/watch?v=abc123&list=PL999&t=42")).toBe("abc123")

	// a short link has the id as its first path segment, with any timestamp hanging off the query
	expect(toYoutubeVideoId("https://youtu.be/abc123")).toBe("abc123")
	expect(toYoutubeVideoId("https://youtu.be/abc123?t=42")).toBe("abc123")

	// a short, an embed, and a live replay each have the id after the path that names them
	expect(toYoutubeVideoId("https://www.youtube.com/shorts/abc123")).toBe("abc123")
	expect(toYoutubeVideoId("https://www.youtube.com/embed/abc123")).toBe("abc123")
	expect(toYoutubeVideoId("https://www.youtube.com/live/abc123")).toBe("abc123")

	// a playlist page, a channel, another video host, a bare short link, and an unparseable string are all not videos
	expect(toYoutubeVideoId("https://www.youtube.com/playlist?list=PL999")).toBeNull()
	expect(toYoutubeVideoId("https://www.youtube.com/@somechannel")).toBeNull()
	expect(toYoutubeVideoId("https://vimeo.com/12345")).toBeNull()
	expect(toYoutubeVideoId("https://youtu.be/")).toBeNull()
	expect(toYoutubeVideoId("https://www.youtube.com/shorts/")).toBeNull()
	expect(toYoutubeVideoId("not a url")).toBeNull()
})

// only a Vimeo url takes the Vimeo transcript path, and a Vimeo id is the digits in the path
test("toVimeoVideoId reads the id from every Vimeo url shape", () => {
	// a plain link, a player embed, and the channel and group links all have the id as a digit segment
	expect(toVimeoVideoId("https://vimeo.com/76979871")).toBe("76979871")
	expect(toVimeoVideoId("https://player.vimeo.com/video/76979871")).toBe("76979871")
	expect(toVimeoVideoId("https://vimeo.com/channels/staffpicks/76979871")).toBe("76979871")
	expect(toVimeoVideoId("https://vimeo.com/groups/motion/videos/76979871")).toBe("76979871")

	// a user page, another host, and an unparseable string are all not videos
	expect(toVimeoVideoId("https://vimeo.com/someuser")).toBeNull()
	expect(toVimeoVideoId("https://youtube.com/watch?v=abc")).toBeNull()
	expect(toVimeoVideoId("not a url")).toBeNull()
})

// a Dailymotion url puts a title slug after its id, which the metadata endpoint does not accept
test("toDailymotionVideoId reads the bare id without its title slug", () => {
	// a full link has the id after /video, and a dai.ly short link has it as its first segment
	expect(toDailymotionVideoId("https://www.dailymotion.com/video/x942ozu")).toBe("x942ozu")
	expect(toDailymotionVideoId("https://dai.ly/x942ozu")).toBe("x942ozu")

	// a title slug follows the id after an underscore and is not part of it
	expect(toDailymotionVideoId("https://www.dailymotion.com/video/x942ozu_some-title")).toBe("x942ozu")

	// a channel page, another host, and an unparseable string are all not videos
	expect(toDailymotionVideoId("https://www.dailymotion.com/somechannel")).toBeNull()
	expect(toDailymotionVideoId("https://vimeo.com/76979871")).toBeNull()
	expect(toDailymotionVideoId("not a url")).toBeNull()
})

// every host lists its tracks in its own shape and its own order, so each maps to the shared one
test("each host's payload maps to the shared caption track shape", () => {
	// YouTube nests its list two renderers deep and returns it sorted by language code
	const youtubeTracks = toYoutubeCaptionTracks(
		toPlayerPayload([
			{ baseUrl: "https://www.youtube.com/api/timedtext?lang=ar", languageCode: "ar" },
			{ baseUrl: "https://www.youtube.com/api/timedtext?lang=en", languageCode: "en" },
		]),
	)
	expect(youtubeTracks).toEqual([
		{ languageCode: "ar", url: "https://www.youtube.com/api/timedtext?lang=ar" },
		{ languageCode: "en", url: "https://www.youtube.com/api/timedtext?lang=en" },
	])

	// Vimeo names the language "lang" and serves its tracks from its own caption domain
	const vimeoTracks = toVimeoCaptionTracks({
		request: { text_tracks: [{ lang: "de", url: "https://captions.vimeo.com/captions/170.vtt" }] },
	})
	expect(vimeoTracks).toEqual([{ languageCode: "de", url: "https://captions.vimeo.com/captions/170.vtt" }])

	// Dailymotion keys its map by language and holds each track's urls in a list
	const dailymotionTracks = toDailymotionCaptionTracks({
		subtitles: { data: { "en-auto": { urls: ["https://static2.dmcdn.net/x.srt"] } } },
	})
	expect(dailymotionTracks).toEqual([{ languageCode: "en-auto", url: "https://static2.dmcdn.net/x.srt" }])

	// a track listed without a url is nothing to fetch, and an absent list reads as no captions
	expect(toVimeoCaptionTracks({ request: { text_tracks: [{ lang: "en" }] } })).toEqual([])
	expect(toYoutubeCaptionTracks(null)).toEqual([])
	expect(toDailymotionCaptionTracks(null)).toEqual([])
})

// Vimeo serves WEBVTT and Dailymotion serves SRT, and one parser has to read both
test("toCueText reads WEBVTT and SRT down to their words", () => {
	// a WEBVTT file opens with its header, then numbers each cue above its timing line
	const webvtt =
		"WEBVTT\n\n1\n00:00:05.237 --> 00:00:08.043\nHere at Vimeo we are\n\n2\n00:00:08.043 --> 00:00:10.000\nalways working"
	expect(toCueText(webvtt)).toBe("Here at Vimeo we are always working")

	// an SRT file has no header and punctuates its timestamps with commas
	const srt =
		"1\n00:00:00,000 --> 00:00:03,000\nAmbulance emergency\n\n2\n00:00:03,000 --> 00:00:07,000\nis the patient breathing?"
	expect(toCueText(srt)).toBe("Ambulance emergency is the patient breathing?")

	// WEBVTT marks up speakers and emphasis inline, which is not spoken text
	expect(toCueText("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Alice>hello <i>there</i>")).toBe("hello there")

	// a note block annotates a cue file and is not spoken either
	expect(toCueText("WEBVTT\n\nNOTE this is a comment\n\n00:00:01.000 --> 00:00:02.000\nthe words")).toBe("the words")

	// a file with no cues at all joins to nothing	expect(toCueText("WEBVTT\n\n")).toBe("")
	expect(toCueText("")).toBe("")
})

// the caption response arrives as timed lines, which have to read as prose by the time a model sees them
test("toTranscriptText joins the caption lines without running their words together", () => {
	// a line ends without a trailing space, so joining lines directly would produce "howcrazy" out of "how" and "crazy"
	const captions = {
		events: [{ segs: [{ utf8: "appreciate how" }] }, { segs: [{ utf8: "crazy it is" }] }],
	}
	expect(toTranscriptText(captions)).toBe("appreciate how crazy it is")

	// within one line the segments are words with their own spacing, so they join directly
	expect(toTranscriptText({ events: [{ segs: [{ utf8: "hello " }, { utf8: "world" }] }] })).toBe("hello world")

	// the line breaks and padding in captions collapse to single spaces
	expect(
		toTranscriptText({
			events: [{ segs: [{ utf8: "one" }] }, { segs: [{ utf8: "\n" }] }, { segs: [{ utf8: "two" }] }],
		}),
	).toBe("one two")

	// an event with no segments is a timing-only gap, so it contributes nothing
	expect(toTranscriptText({ events: [{}, { segs: [{ utf8: "only this" }] }] })).toBe("only this")

	// nothing spoken joins to nothing	expect(toTranscriptText({ events: [] })).toBe("")
	expect(toTranscriptText(null)).toBe("")
})

// an episode that declared no transcript is scored on its show notes, so the router spends no scrape credit on it
test("fetchContent skips the fetch for an episode with no transcript", async () => {
	const fetched = await fetchContent("https://example.com/episode", "listen")
	expect(fetched).toEqual({ text: "", cost: 0, etag: null, lastModified: null })
})
