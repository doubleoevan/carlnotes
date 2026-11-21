// card response tests: a card is immutable at its current version, any other query string redirects to that version
// without reading storage, the lookup is read once a minute, and a card that just changed is served at its new version
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as store from "@carlnotes/db/store"
import { Hono } from "hono"
import { type PreviewCard, toCardResponse } from "./cardResponse"
import { toPreviewVersion } from "./previewImage"

// the png signature every stored card starts with
const CARD_BYTES = new Uint8Array([137, 80, 78, 71])

// put the spies and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// a card route over a lookup that returns the current title, and the count of lookups and storage reads it sends
function toCardRoute(): { cardRoute: Hono; setTitle: (title: string | null) => void; lookupCount: () => number } {
	// the in-memory Redis store, and a stored card for every key
	stubRedisClient()
	spyOn(store, "attachmentExists").mockResolvedValue(true)
	spyOn(store, "getAttachmentBytes").mockResolvedValue(CARD_BYTES)

	// the lookup returns the current title, or no card for no title, and the card's key changes with it
	let title: string | null = "Light Roasts"
	let sentLookupCount = 0

	// the route reads the card through the counted lookup
	const cardRoute = new Hono().get("/card.png", async (context) => {
		const cardResponse = await toCardResponse({
			context,
			cardKey: "test:card-1",
			loadPreview: async () => {
				sentLookupCount += 1
				return title === null ? null : { title }
			},
			// the card drawn with the title
			toPreviewCard: (preview: { title: string }): PreviewCard => ({
				previewKey: toCardKey(preview.title),
				renderPng: async () => CARD_BYTES,
			}),
		})
		return cardResponse?.response ?? context.json({ error: "not found" }, 404)
	})

	// the route, a setter for the title, and the lookup count
	return {
		cardRoute,
		setTitle: (nextTitle) => {
			title = nextTitle
		},
		lookupCount: () => sentLookupCount,
	}
}

// the storage key and the version of the card drawn with a title
function toCardKey(title: string): string {
	return `og/test/${title}.png`
}
function toCardVersion(title: string): string {
	return toPreviewVersion(toCardKey(title))
}

// the current version's bytes never change, so the browser caches them for a year and the edge for a day
test("a card at its current version is immutable", async () => {
	const { cardRoute } = toCardRoute()
	const response = await cardRoute.request(`/card.png?v=${toCardVersion("Light Roasts")}`)

	expect(response.status).toBe(200)
	expect(response.headers.get("Content-Type")).toBe("image/png")
	expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable")
	expect(response.headers.get("CDN-Cache-Control")).toBe("max-age=86400")
})

// a link shared without a version, an unknown query, or an old version redirects to the current version, so a changing
// query string never reads the card from storage
test("a card request with any query but its current version redirects without reading storage", async () => {
	const { cardRoute } = toCardRoute()
	const attachmentExistsSpy = spyOn(store, "attachmentExists")
	const currentCardPath = `/card.png?v=${toCardVersion("Light Roasts")}`

	// each request is the redirect to the current version, which the edge and the browser cache for a minute
	for (const cardPath of ["/card.png", "/card.png?x=1", "/card.png?x=2", `${currentCardPath}&x=1`]) {
		const response = await cardRoute.request(cardPath)
		expect(response.status).toBe(302)
		expect(response.headers.get("Location")).toBe(currentCardPath)
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=60")
	}
	expect(attachmentExistsSpy).not.toHaveBeenCalled()
})

// a looped card request reads the lookup's cached copy, so its queries run once
test("a hundred card requests inside a minute run the lookup once", async () => {
	const { cardRoute, lookupCount } = toCardRoute()
	for (let i = 0; i < 100; i++) {
		await cardRoute.request(`/card.png?v=${toCardVersion("Light Roasts")}`)
	}
	expect(lookupCount()).toBe(1)
})

// a crawler reading a page head drawn after an edit asks for the new version, which the cached lookup does not draw,
// so the lookup is read again and the new card is served instead of a redirect to the earlier one
test("a card that just changed is served at its new version", async () => {
	const { cardRoute, setTitle, lookupCount } = toCardRoute()
	await cardRoute.request(`/card.png?v=${toCardVersion("Light Roasts")}`)

	// the title changes inside the lookup's minute, and the new version is served at once
	setTitle("Dark Roasts")
	const response = await cardRoute.request(`/card.png?v=${toCardVersion("Dark Roasts")}`)
	expect(response.status).toBe(200)
	expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable")
	expect(lookupCount()).toBe(2)

	// the fresh lookup is cached, so a request without a version redirects to the new card
	const redirectResponse = await cardRoute.request("/card.png")
	expect(redirectResponse.headers.get("Location")).toBe(`/card.png?v=${toCardVersion("Dark Roasts")}`)
	expect(lookupCount()).toBe(2)
})

// a request for a card that does not exist responds 404
test("a card with no lookup responds 404", async () => {
	stubRedisClient()

	// a route whose lookup finds nothing
	const cardRoute = new Hono().get("/card.png", async (context) => {
		const cardResponse = await toCardResponse({
			context,
			cardKey: "test:missing",
			loadPreview: async () => null,
			toPreviewCard: (): PreviewCard => ({ previewKey: "og/test/missing.png", renderPng: async () => CARD_BYTES }),
		})
		return cardResponse?.response ?? context.json({ error: "not found" }, 404)
	})
	expect((await cardRoute.request("/card.png?v=abc")).status).toBe(404)
})

// a card looked up before it existed is read again at its version, so it never stays missing for the lookup's minute
test("a card that appears inside the minute is served at its version", async () => {
	const { cardRoute, setTitle } = toCardRoute()
	setTitle(null)
	expect((await cardRoute.request("/card.png")).status).toBe(404)

	// the card now exists, and a request at its version reads the lookup again
	setTitle("Dark Roasts")
	expect((await cardRoute.request(`/card.png?v=${toCardVersion("Dark Roasts")}`)).status).toBe(200)
})
