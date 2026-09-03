// the link preview card a link in a chat message gets: fetched once at post-time, stored under its url, and served from this origin
import type { ChatLinkPreview } from "@shared/contracts"
import { and, eq, gte, inArray } from "drizzle-orm"
import { db } from "../../db"
import { linkPreviews } from "../../db/schema"
import {
	fetchLinkPreviewImage,
	fetchLinkPreviewMetadata,
	type LinkPreviewMetaTags,
	toLinkPreviewImageKey,
	toLinkPreviewUrls,
	toNormalizedLinkPreviewUrl,
	toYoutubeVideoId,
	uploadAttachment,
} from "../../worker"
import { decryptChatText, encryptChatText } from "./encryption"

// how many links one team can fetch in an hour. past this a chat message reuses the cache or goes without a card
const TEAM_PREVIEW_FETCHES_PER_HOUR = 20

// how long a fetched link preview stands in for a fresh fetch
const PREVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000

// how long a url that could not be previewed is left alone before a later chat message can attempt it again
const FAILED_PREVIEW_TTL_MS = 15 * 60 * 1000

// how many of a chat message's links get cards, which keeps the bubble readable and the fetch budget bounded
const MESSAGE_PREVIEW_LIMIT = 3

/**
 * Fetch and store the link previews for a chat message's first links up to a limit.
 * A chat room message names its team, whose hourly limit bounds the fetches. A private chat message passes none.
 */
export async function saveLinkPreviews(content: string, teamId?: string): Promise<void> {
	// a stored link preview is what makes the same link in many chat messages cost one fetch
	for (const linkPreviewUrl of toStorableLinkPreviewUrls(content)) {
		if (await isLinkPreviewStored(linkPreviewUrl)) {
			continue
		}

		// the hourly limit is per team, so one chat room pasting links cannot spend every team's fetch budget
		if (teamId && !(await isTeamUnderFetchLimit(teamId))) {
			return
		}
		await fetchAndStoreLinkPreview(linkPreviewUrl, teamId ?? null)
	}
}

// the chat message's first links as their cache keys
function toStorableLinkPreviewUrls(content: string): string[] {
	// a malformed, non-http, or internal url is dropped here and never reaches a fetch
	const storableUrls: string[] = []
	for (const messageUrl of toLinkPreviewUrls(content, MESSAGE_PREVIEW_LIMIT)) {
		try {
			storableUrls.push(toNormalizedLinkPreviewUrl(messageUrl))
		} catch {}
	}
	return storableUrls
}

/**
 * The stored link preview for one url, fetching and caching it when nothing usable is stored yet.
 * Null if the page offers no link preview or the last fetch failed.
 */
export async function loadOrFetchLinkPreview(url: string): Promise<ChatLinkPreview | null> {
	// the same cache key every chat message link uses
	const [linkPreviewUrl] = toStorableLinkPreviewUrls(url)
	if (!linkPreviewUrl) {
		return null
	}

	// a fresh miss fetches once, and a stored row inside its ttl answers as it is
	if (!(await isLinkPreviewStored(linkPreviewUrl))) {
		await fetchAndStoreLinkPreview(linkPreviewUrl, null)
	}

	// only a ready row has a card to show
	const [linkPreviewRow] = await db
		.select()
		.from(linkPreviews)
		.where(and(eq(linkPreviews.url, linkPreviewUrl), eq(linkPreviews.status, "ready")))
	return linkPreviewRow ? toLinkPreviewCard(linkPreviewRow) : null
}

/**
 * The link previews for a batch of chat messages, keyed by chat message id, each chat message's cards in the order its links appear.
 * The private chat reads through this too, keyed by each chat turn's index instead of a chat message id.
 */
export async function loadChatLinkPreviews(
	contentByChatMessageId: Map<number, string>,
): Promise<Map<number, ChatLinkPreview[]>> {
	// the first links in each chat message, which are what its link previews are keyed by
	const urlsByChatMessageId = new Map<number, string[]>()
	for (const [chatMessageId, content] of contentByChatMessageId) {
		const storableUrls = toStorableLinkPreviewUrls(content)
		if (storableUrls.length > 0) {
			urlsByChatMessageId.set(chatMessageId, storableUrls)
		}
	}

	// a batch with no links needs no query at all
	if (urlsByChatMessageId.size === 0) {
		return new Map()
	}

	// every url's stored link preview in one query. a failed one has no card to show
	const allUrls = [...new Set([...urlsByChatMessageId.values()].flat())]
	const linkPreviewRows = await db
		.select()
		.from(linkPreviews)
		.where(and(inArray(linkPreviews.url, allUrls), eq(linkPreviews.status, "ready")))
	const linkPreviewsByUrl = new Map(linkPreviewRows.map((linkPreviewRow) => [linkPreviewRow.url, linkPreviewRow]))

	// each chat message takes the link previews its own links resolved to, and one not stored yet just shows no card
	const linkPreviewsByChatMessageId = new Map<number, ChatLinkPreview[]>()
	for (const [chatMessageId, urls] of urlsByChatMessageId) {
		// the cards keep the order the links appear in, skipping any url without a ready row
		const chatMessageLinkPreviews = urls
			.map((url) => linkPreviewsByUrl.get(url))
			.filter((linkPreviewRow) => linkPreviewRow !== undefined)
			.map(toLinkPreviewCard)
		// a chat message with nothing stored yet is left out entirely
		if (chatMessageLinkPreviews.length > 0) {
			linkPreviewsByChatMessageId.set(chatMessageId, chatMessageLinkPreviews)
		}
	}
	return linkPreviewsByChatMessageId
}

/**
 * A stored link preview's image bytes by its id, or null if it holds no image.
 */
export async function loadLinkPreviewImage(
	linkPreviewId: string,
): Promise<{ objectKey: string; contentType: string } | null> {
	const [linkPreviewRow] = await db
		.select({ imageObjectKey: linkPreviews.imageObjectKey, imageContentType: linkPreviews.imageContentType })
		.from(linkPreviews)
		.where(eq(linkPreviews.id, linkPreviewId))

	// a link preview without a stored image has nothing to show
	if (!linkPreviewRow?.imageObjectKey) {
		return null
	}
	return { objectKey: linkPreviewRow.imageObjectKey, contentType: linkPreviewRow.imageContentType ?? "image/png" }
}

// whether this url already has a link preview recent enough to reuse. a failed one is left alone for its own window
async function isLinkPreviewStored(linkPreviewUrl: string): Promise<boolean> {
	const [linkPreviewRow] = await db
		.select({ status: linkPreviews.status, fetchedAt: linkPreviews.fetchedAt })
		.from(linkPreviews)
		.where(eq(linkPreviews.url, linkPreviewUrl))
	if (!linkPreviewRow) {
		return false
	}

	// a failed url gets a shorter window than a fetched one, so a host that recovers is picked up faster
	const ttlMs = linkPreviewRow.status === "failed" ? FAILED_PREVIEW_TTL_MS : PREVIEW_TTL_MS
	return Date.now() - linkPreviewRow.fetchedAt.getTime() < ttlMs
}

// whether the team has preview link fetches left this hour
async function isTeamUnderFetchLimit(teamId: string): Promise<boolean> {
	// the limit itself bounds the count, so a busy team never scans more rows than it is allowed
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
	const recentLinkPreviewFetchRows = await db
		.select({ id: linkPreviews.id })
		.from(linkPreviews)
		.where(and(eq(linkPreviews.fetchedByTeamId, teamId), gte(linkPreviews.fetchedAt, oneHourAgo)))
		.limit(TEAM_PREVIEW_FETCHES_PER_HOUR)
	return recentLinkPreviewFetchRows.length < TEAM_PREVIEW_FETCHES_PER_HOUR
}

// fetch the page and store what it offered, recording a failure so a dead link is not refetched on every post
async function fetchAndStoreLinkPreview(linkPreviewUrl: string, teamId: string | null): Promise<void> {
	try {
		// the page's own tags. the fetch rejects an internal address on any redirect hop
		const previewMetadata = await fetchLinkPreviewMetadata(linkPreviewUrl)
		if (!previewMetadata.title && !previewMetadata.description) {
			await storeFailedLinkPreview(linkPreviewUrl, teamId)
			return
		}

		// the row is stored before the image, so its id names the image's object key
		const linkPreviewId = await storeReadyLinkPreview(linkPreviewUrl, teamId, previewMetadata)
		if (linkPreviewId && previewMetadata.imageUrl) {
			await storeLinkPreviewImage(linkPreviewId, previewMetadata.imageUrl)
		}
	} catch (error) {
		// an internal address, a dead host, or a page that answered with something else all record a failure
		console.error(`link preview failed for ${linkPreviewUrl}`, error)
		await storeFailedLinkPreview(linkPreviewUrl, teamId)
	}
}

// store a fetched link preview and return its id, which the image's object key is named after
async function storeReadyLinkPreview(
	linkPreviewUrl: string,
	teamId: string | null,
	linkPreviewMetaTags: LinkPreviewMetaTags,
): Promise<string> {
	// the page's words are encrypted the way the chat message its url was pasted into is
	const linkPreviewValues = {
		title: linkPreviewMetaTags.title ? encryptChatText(linkPreviewMetaTags.title) : null,
		description: linkPreviewMetaTags.description ? encryptChatText(linkPreviewMetaTags.description) : null,
		status: "ready" as const,
		fetchedByTeamId: teamId,
		fetchedAt: new Date(),
	}

	// a url two teams fetched at the same moment keeps one row, refreshed with this fetch
	const [linkPreviewRow] = await db
		.insert(linkPreviews)
		.values({ url: linkPreviewUrl, ...linkPreviewValues })
		.onConflictDoUpdate({ target: linkPreviews.url, set: linkPreviewValues })
		.returning({ id: linkPreviews.id })
	return linkPreviewRow?.id ?? ""
}

// record a url that could not be previewed
async function storeFailedLinkPreview(linkPreviewUrl: string, teamId: string | null): Promise<void> {
	await db
		.insert(linkPreviews)
		.values({ url: linkPreviewUrl, status: "failed", fetchedByTeamId: teamId, fetchedAt: new Date() })
		.onConflictDoUpdate({
			target: linkPreviews.url,
			set: { status: "failed", fetchedByTeamId: teamId, fetchedAt: new Date() },
		})
}

// fetch the page's image once and store it here, so no user's browser ever reaches the third-party host
async function storeLinkPreviewImage(linkPreviewId: string, imageUrl: string): Promise<void> {
	// an image that is missing, too large, or not a type served inline leaves the card with its text alone
	try {
		// the bytes go to object storage under a key the link preview id names
		const linkPreviewImage = await fetchLinkPreviewImage(imageUrl)
		const imageObjectKey = toLinkPreviewImageKey(linkPreviewId)
		await uploadAttachment(imageObjectKey, linkPreviewImage.bytes, linkPreviewImage.contentType)

		// the row points at the stored image only once the bytes are in place
		await db
			.update(linkPreviews)
			.set({ imageObjectKey, imageContentType: linkPreviewImage.contentType })
			.where(eq(linkPreviews.id, linkPreviewId))
	} catch (error) {
		console.error(`link preview image failed for ${imageUrl}`, error)
	}
}

// a stored row as the card the chat messages render, with its text decrypted
function toLinkPreviewCard(linkPreviewRow: typeof linkPreviews.$inferSelect): ChatLinkPreview {
	return {
		url: linkPreviewRow.url,
		title: linkPreviewRow.title ? decryptChatText(linkPreviewRow.title) : null,
		description: linkPreviewRow.description ? decryptChatText(linkPreviewRow.description) : null,
		// the image is served from this origin by link preview id, and one that stored none has no path
		imagePath: linkPreviewRow.imageObjectKey ? `/api/link-previews/${linkPreviewRow.id}/image` : null,
		// a YouTube link's card plays the video in place instead of only linking out
		youtubeVideoId: toYoutubeVideoId(linkPreviewRow.url),
	}
}
