// card response tests: a card is cached long only if its url names the card's current version
import { expect, test } from "bun:test"
import { Hono } from "hono"
import { toPreviewPngResponse } from "./preview"

// one card at the version "abc", sent the way the card routes send it
const cardRoute = new Hono().get("/card.png", (context) =>
	toPreviewPngResponse(context, { bytes: new Uint8Array([137, 80, 78, 71]), version: "abc" }),
)

// the current version's bytes never change, so the browser caches them for a year and the edge for a day
test("a card at its current version is immutable", async () => {
	const response = await cardRoute.request("/card.png?v=abc")
	expect(response.headers.get("Content-Type")).toBe("image/png")
	expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable")
	expect(response.headers.get("CDN-Cache-Control")).toBe("max-age=86400")
})

// a url from before the card changed, or a link shared without a version, gets the current card for a minute
test("a card at an old version or with none is cached for a minute", async () => {
	for (const cardPath of ["/card.png?v=old", "/card.png"]) {
		const response = await cardRoute.request(cardPath)
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=60")
		expect(response.headers.get("CDN-Cache-Control")).toBeNull()
	}
})
