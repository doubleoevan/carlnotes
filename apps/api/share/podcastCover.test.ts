// podcast cover tests: a show title's three-line limit, the top band's line, the bands' gradients and palettes over a
// topic image, the url's key, and the rendered file's size
import { expect, spyOn, test } from "bun:test"
import * as store from "@carlnotes/db/store"
import { darkRoast, latte } from "@carlnotes/nightshift/colors"
import type { CardElement } from "@carlnotes/pipeline/cardElementPng"
import {
	toLatestPodcastCoverKey,
	toLatestPodcastCoverPath,
	toPodcastCoverKey,
	toPodcastCoverPath,
} from "@carlnotes/server/podcastCoverPaths"
import { renderAsync } from "@resvg/resvg-js"
import { MAX_PODCAST_COVER_BYTES, toPodcastCoverElement, toPodcastCoverJpeg } from "./podcastCover"
import type { CoverBandTones } from "./podcastCoverBands"

// a cover's key is signed with the app's auth secret
Bun.env.BETTER_AUTH_SECRET ??= "podcast-cover-test-secret"

// a podcast episode's cover with no image of its own or of its topic's
const PODCAST_EPISODE_COVER = {
	kind: "episode" as const,
	id: "episode-1",
	title: "A quieter grinder",
	topicId: "topic-1",
	topicImageHash: null,
	podcastEpisodeImageHash: null,
	details: "Home espresso · 2026 · E4",
}

// every element of a cover's markup, flattened, so a test can find an element by its children
function toCardElements(cardElement: CardElement): CardElement[] {
	const children = Array.isArray(cardElement.props.children) ? cardElement.props.children : []
	const childElements = children.filter((child): child is CardElement => typeof child !== "string")
	return [cardElement, ...childElements.flatMap((childElement) => toCardElements(childElement))]
}

test("a show title stops at three lines under the top band's line", () => {
	// the elements of a show's cover
	const showCoverElements = toCardElements(
		toPodcastCoverElement(
			{ kind: "show", id: "topic-1", title: "Home espresso", topicId: "topic-1", topicImageHash: null },
			"data:,",
		),
	)

	// the title's element wraps and is limited to three lines
	const titleElement = showCoverElements.find((cardElement) => cardElement.props.children === "Home espresso")
	expect(titleElement?.props.style).toMatchObject({ lineClamp: 3, color: "#332a22" })

	// the top band's two parts in their colors, in a band that starts at the cover's top edge
	const topBandElement = showCoverElements.find((cardElement) => cardElement.props.style?.height === 540)
	expect(topBandElement?.props.style).toMatchObject({ top: 0, alignItems: "center", justifyContent: "center" })
	expect(
		showCoverElements.find((cardElement) => cardElement.props.children === "Coffee Break")?.props.style,
	).toMatchObject({
		color: "#f09050",
	})
	expect(showCoverElements.find((cardElement) => cardElement.props.children === "podcast")?.props.style).toMatchObject({
		color: "#f3e9db",
	})
})

test("a new title, image, or detail line is a new key and a new url, and the same cover is the same one", () => {
	// the same cover under a new title, a new image of its own, and a new detail line
	const podcastCover = PODCAST_EPISODE_COVER
	const changedPodcastCovers = [
		{ ...podcastCover, title: "A louder grinder" },
		{ ...podcastCover, podcastEpisodeImageHash: "0123456789abcdef0123456789abcdef" },
		{ ...podcastCover, details: "Espresso at home · 2026 · E4" },
	]
	for (const changedPodcastCover of changedPodcastCovers) {
		expect(toPodcastCoverKey(changedPodcastCover)).not.toBe(toPodcastCoverKey(podcastCover))
	}
	expect(toPodcastCoverKey({ ...podcastCover })).toBe(toPodcastCoverKey(podcastCover))

	// the path names the kind, the id, the key, and the size
	const coverPath = toPodcastCoverPath(podcastCover, 600)
	expect(coverPath).toBe(`/api/podcast-covers/episode/episode-1/${toPodcastCoverKey(podcastCover)}-600.jpg`)
})

test("a cover's latest key stays through a new title, image, or detail line, and differs from its current key", () => {
	// the recording podcast episode's cover, then the same podcast episode once it publishes with its own image
	const recordingCover = { ...PODCAST_EPISODE_COVER, details: "Home espresso" }
	const publishedCover = { ...PODCAST_EPISODE_COVER, podcastEpisodeImageHash: "0123456789abcdef0123456789abcdef" }
	expect(toLatestPodcastCoverPath(recordingCover, 600)).toBe(toLatestPodcastCoverPath(publishedCover, 600))

	// the latest key is its own key, and the path names it like the current one
	const latestKey = toLatestPodcastCoverKey("episode", "episode-1")
	expect(latestKey).not.toBe(toPodcastCoverKey(recordingCover))
	expect(toLatestPodcastCoverPath(recordingCover, 600)).toBe(
		`/api/podcast-covers/episode/episode-1/${latestKey}-600.jpg`,
	)
})

// the JPEG encoding needs ffmpeg, which the runtime image has and a developer's machine may not
test.skipIf(!Bun.which("ffmpeg"))(
	"a cover renders as a JPEG under the byte limit at both sizes",
	async () => {
		// a plain square in place of the illustration
		const illustrationSvg =
			'<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="3000"><rect width="3000" height="3000" fill="#e8dcc8"/></svg>'
		const illustrationPng = (await renderAsync(illustrationSvg)).asPng()
		const illustrationDataUri = `data:image/png;base64,${Buffer.from(illustrationPng).toString("base64")}`
		const podcastCover = { ...PODCAST_EPISODE_COVER, title: "FW25 week: reviews, stockists, and the Sondag backstory" }

		// a JPEG starts with its start-of-image marker
		for (const size of [3000, 600] as const) {
			const coverJpeg = await toPodcastCoverJpeg({ podcastCover, size, illustrationDataUri })
			expect([coverJpeg[0], coverJpeg[1]]).toEqual([0xff, 0xd8])
			expect(coverJpeg.byteLength).toBeLessThanOrEqual(MAX_PODCAST_COVER_BYTES)
		}
	},
	30_000,
)

// a topic image moves every cover of the topic to a new url, and a cover with none keeps the key it had
test("a topic image's hash is in the key, and a cover with none keeps its old key", () => {
	const podcastCover = {
		kind: "show" as const,
		id: "topic-1",
		title: "Home espresso",
		topicId: "topic-1",
		topicImageHash: null,
	}
	const imageCover = { ...podcastCover, topicImageHash: "0123456789abcdef0123456789abcdef" }
	expect(toPodcastCoverKey(imageCover)).not.toBe(toPodcastCoverKey(podcastCover))
	expect(toPodcastCoverKey({ ...imageCover, topicImageHash: "ffffffffffffffffffffffffffffffff" })).not.toBe(
		toPodcastCoverKey(imageCover),
	)
})

// over a topic image the bands get their gradients, and over the illustration they keep its empty bands
test("the bands sit on gradients over a topic image alone", () => {
	const podcastCover = {
		kind: "show" as const,
		id: "topic-1",
		title: "Home espresso",
		topicId: "topic-1",
		topicImageHash: null,
	}
	const toBandStyles = (bandTones: CoverBandTones | null): unknown[] =>
		toCardElements(toPodcastCoverElement(podcastCover, "data:,", bandTones))
			.map((cardElement) => cardElement.props.style?.backgroundImage)
			.filter(Boolean)
	expect(toBandStyles({ top: "dark", bottom: "light" })).toHaveLength(2)
	expect(toBandStyles(null)).toHaveLength(0)
})

// each band's text is in its tone's palette
test("each band's text takes its tone's palette", () => {
	const coverElements = toCardElements(
		toPodcastCoverElement(
			{ kind: "show", id: "topic-1", title: "Home espresso", topicId: "topic-1", topicImageHash: null },
			"data:,",
			{ top: "light", bottom: "dark" },
		),
	)
	const titleElement = coverElements.find((cardElement) => cardElement.props.children === "Home espresso")
	expect(titleElement?.props.style).toMatchObject({ color: darkRoast.foreground })
	const podcastWordElement = coverElements.find((cardElement) => cardElement.props.children === "podcast")
	expect(podcastWordElement?.props.style).toMatchObject({ color: latte.foreground })
})

// the JPEG encoding needs ffmpeg, and a podcast episode with no image of its own reads its topic's original
test.skipIf(!Bun.which("ffmpeg"))(
	"a podcast episode cover over its topic's image renders as a JPEG under the byte limit",
	async () => {
		// the sample image stands in for the stored original
		const sampleJpeg = new Uint8Array(
			await Bun.file(new URL("./fixtures/home-espresso-lite.jpg", import.meta.url)).arrayBuffer(),
		)
		const getAttachmentBytesSpy = spyOn(store, "getAttachmentBytes").mockResolvedValue(sampleJpeg)
		const podcastCover = { ...PODCAST_EPISODE_COVER, topicImageHash: "0123456789abcdef0123456789abcdef" }
		const coverJpeg = await toPodcastCoverJpeg({ podcastCover, size: 600 })
		expect([coverJpeg[0], coverJpeg[1]]).toEqual([0xff, 0xd8])
		expect(coverJpeg.byteLength).toBeLessThanOrEqual(MAX_PODCAST_COVER_BYTES)
		expect(getAttachmentBytesSpy).toHaveBeenCalledWith(
			`topic-images/topic-1/${podcastCover.topicImageHash}/original.jpg`,
		)
		getAttachmentBytesSpy.mockRestore()
	},
	30_000,
)
