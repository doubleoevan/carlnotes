// podcast cover tests: a title's size steps, its three-line limit, the top band's line, the url's key,
// and the rendered file's size
import { expect, test } from "bun:test"
import { renderAsync } from "@resvg/resvg-js"
import { toPodcastCoverKey, toPodcastCoverPath } from "@shared/podcastEpisodes"
import {
	MAX_PODCAST_COVER_BYTES,
	toPodcastCoverElement,
	toPodcastCoverJpeg,
	toPodcastCoverTitleFontSize,
} from "./podcastCover"
import type { CardElement } from "./previewImage"

// a cover's key is signed with the app's auth secret
Bun.env.BETTER_AUTH_SECRET ??= "podcast-cover-test-secret"

// every element of a cover's markup, flattened, so a test can find an element by its children
function toCardElements(cardElement: CardElement): CardElement[] {
	const children = Array.isArray(cardElement.props.children) ? cardElement.props.children : []
	const childElements = children.filter((child): child is CardElement => typeof child !== "string")
	return [cardElement, ...childElements.flatMap((childElement) => toCardElements(childElement))]
}

test("a title's size steps down as the title gets longer", () => {
	// a title at each step
	const titleSizes = ["Home espresso", "Emerging menswear designers", "x".repeat(60)].map(toPodcastCoverTitleFontSize)
	expect(titleSizes).toEqual([260, 180, 120])
})

test("a title stops at three lines under the top band's line", () => {
	// the elements of a podcast episode's cover and of a show's cover
	const podcastEpisodeCoverElements = toCardElements(
		toPodcastCoverElement({ kind: "episode", id: "episode-1", title: "A quieter grinder" }, "data:,"),
	)
	const showCoverElements = toCardElements(
		toPodcastCoverElement({ kind: "show", id: "topic-1", title: "Home espresso" }, "data:,"),
	)

	// the title's element wraps and is limited to three lines
	const titleElement = podcastEpisodeCoverElements.find(
		(cardElement) => cardElement.props.children === "A quieter grinder",
	)
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

test("a new title is a new key and a new url, and the same title is the same one", () => {
	// the same cover under a new title
	const podcastCover = { kind: "episode" as const, id: "episode-1", title: "A quieter grinder" }
	const retitledPodcastCover = { ...podcastCover, title: "A louder grinder" }
	expect(toPodcastCoverKey(retitledPodcastCover)).not.toBe(toPodcastCoverKey(podcastCover))
	expect(toPodcastCoverKey({ ...podcastCover })).toBe(toPodcastCoverKey(podcastCover))

	// the path names the kind, the id, the key, and the size
	const coverPath = toPodcastCoverPath(podcastCover, 600)
	expect(coverPath).toBe(`/api/podcast-covers/episode/episode-1/${toPodcastCoverKey(podcastCover)}-600.jpg`)
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
		const podcastCover = {
			kind: "episode" as const,
			id: "episode-1",
			title: "FW25 week: reviews, stockists, and the Sondag backstory",
		}

		// a JPEG starts with its start-of-image marker
		for (const size of [3000, 600] as const) {
			const coverJpeg = await toPodcastCoverJpeg({ podcastCover, size, illustrationDataUri })
			expect([coverJpeg[0], coverJpeg[1]]).toEqual([0xff, 0xd8])
			expect(coverJpeg.byteLength).toBeLessThanOrEqual(MAX_PODCAST_COVER_BYTES)
		}
	},
	30_000,
)
