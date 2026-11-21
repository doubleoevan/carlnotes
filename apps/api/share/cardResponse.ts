// a card route's response: the card's lookup through a minute's cache, the redirect to its current version, and its
// png drawn once and stored

import { cacheJson, saveRedisJson } from "@carlnotes/db/redis"
import { attachmentExists, getAttachmentBytes, uploadAttachment } from "@carlnotes/db/store"
import type { Context } from "hono"
import { toVersionedImageHeaders } from "../edgeCache"
import { toPreviewVersion } from "./previewImage"

// a card's storage key, and the drawing of its png on the first request for that key
export type PreviewCard = { previewKey: string; renderPng: () => Promise<Uint8Array> }

// how long a card's lookup is cached, and how often a request at another version may read the lookup again
const CARD_LOOKUP_TTL_MS = 60_000
const CARD_LOOKUP_RECHECK_MS = 1000

// what a card route reads: the lookup's cache key, the lookup, and the card the lookup draws
type CardRequest<Preview> = {
	context: Context
	cardKey: string
	loadPreview: () => Promise<Preview | null>
	toPreviewCard: (preview: Preview) => PreviewCard
}

// a card route's response, with the preview it was drawn from
type CardResponse<Preview> = { preview: Preview; response: Response }

/**
 * Returns a card route's response with the preview it was drawn from, or null if there is no card. The lookup is read
 * through a minute's cache. A request whose query string is anything but the card's current `v` is redirected to the
 * versioned url before storage is asked for the card. A request at a version the cached lookup does not draw, or at
 * any version of a card the cached lookup found missing, reads the lookup again, at most once a second per card, so a
 * card that just changed is served at its new version and never redirected to an earlier one.
 */
export async function toCardResponse<Preview>({
	context,
	cardKey,
	loadPreview,
	toPreviewCard,
}: CardRequest<Preview>): Promise<CardResponse<Preview> | null> {
	// the cached lookup, read again if the request names another version
	const lookupKey = `card-lookup:${cardKey}`
	const requestedVersion = context.req.query("v")
	let preview = await cacheJson({ key: lookupKey, ttlMs: CARD_LOOKUP_TTL_MS, load: loadPreview })

	// a card that changed or appeared inside the minute is read again, and a missing card has no response
	if (requestedVersion && (!preview || requestedVersion !== toPreviewVersion(toPreviewCard(preview).previewKey))) {
		preview = await recheckCardLookup({ lookupKey, loadPreview })
	}
	if (!preview) {
		return null
	}

	// redirect any query string but the current version to the versioned url. the edge and the browser cache the
	// redirect for a minute, as long as the lookup it was read from
	const previewCard = toPreviewCard(preview)
	const previewVersion = toPreviewVersion(previewCard.previewKey)
	if (new URL(context.req.url).search !== `?v=${previewVersion}`) {
		const response = context.redirect(`${context.req.path}?v=${previewVersion}`, 302)

		// the same short cache an avatar at an old version is sent with
		for (const [headerName, headerValue] of Object.entries(toVersionedImageHeaders(false))) {
			response.headers.set(headerName, headerValue)
		}
		return { preview, response }
	}

	// the png at its current version, which never changes
	const bytes = await toCachedPng(previewCard)
	const response = context.body(bytes as unknown as ArrayBuffer, 200, {
		"Content-Type": "image/png",
		...toVersionedImageHeaders(true),
	})
	return { preview, response }
}

// read a card's lookup again, shared by every request in the next second, and cache the fresh lookup for a minute
async function recheckCardLookup<Preview>({
	lookupKey,
	loadPreview,
}: Pick<CardRequest<Preview>, "loadPreview"> & { lookupKey: string }): Promise<Preview | null> {
	return cacheJson({
		key: `${lookupKey}:recheck`,
		ttlMs: CARD_LOOKUP_RECHECK_MS,
		load: async () => {
			const preview = await loadPreview()
			await saveRedisJson({ key: lookupKey, value: preview, ttlMs: CARD_LOOKUP_TTL_MS })
			return preview
		},
	})
}

// the pending renders by their preview key
const pendingRenderByPreviewKey = new Map<string, Promise<Uint8Array>>()

// the stored bytes for the key, or a render and store on the first request for this exact preview
async function toCachedPng({ previewKey, renderPng }: PreviewCard): Promise<Uint8Array> {
	if (await attachmentExists(previewKey)) {
		return getAttachmentBytes(previewKey)
	}

	// a miss joins the render already running for this key, or starts one and drops the entry once settled
	let render = pendingRenderByPreviewKey.get(previewKey)
	if (!render) {
		render = renderAndStorePng(previewKey, renderPng)
		pendingRenderByPreviewKey.set(previewKey, render)
		render.finally(() => pendingRenderByPreviewKey.delete(previewKey)).catch(() => {})
	}
	return render
}

// render the png and store it, so the next fetch of this exact preview is a storage read
async function renderAndStorePng(previewKey: string, renderPng: () => Promise<Uint8Array>): Promise<Uint8Array> {
	const bytes = await renderPng()
	await uploadAttachment(previewKey, bytes, "image/png")
	return bytes
}
