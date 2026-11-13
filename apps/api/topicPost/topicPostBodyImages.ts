// a Topic Post's body images on the api: the read signature a non-public post's image urls take, the html each reader
// gets, the count of a post's images, what a save does to the images it names and drops, and the edge purge after a
// removal

import {
	fromTopicPostBodyImagePath,
	IMG_SRC_ATTRIBUTE_PATTERN,
	toTopicPostBodyImageIds,
	toTopicPostBodyImagePath,
} from "@carlnotes/contracts/topicPostBodyImages"
import type { DbHandle } from "@carlnotes/db"
import { clearPendingObjectDeletions, loadUploadKeysInGrace, recordPendingObjectDeletions } from "@carlnotes/db/store"
import { loadRemovedTopicPostBodyImageIds, loadReportedTopicPostBodyImageIds } from "@carlnotes/db/topicImages"
import {
	toTopicPostBodyImageKeyPrefix,
	toTopicPostBodyImageObjectKeys,
} from "@carlnotes/pipeline/topicPosts/topicPostBodyImageFiles"
import { purgeEdgeCacheTagAfterDeletion, toTopicImageCacheTag } from "@carlnotes/server/edgePurge"
import { isSameSignature, toAuthSecretSignature } from "@carlnotes/server/hmac"
import { sanitizeTopicPostHtml } from "../noteHtml"
import type { TopicPostAccessRow, TopicPostRow } from "./topicPosts"

// what a signature signs before the path, so it never matches another use of the auth secret
const SIGNATURE_PURPOSE = "topic-post-body-image"

// a signed url lasts a day past the next whole hour, so one url holds for an hour of the browser's cache
const HOUR_SECONDS = 60 * 60
const SIGNED_URL_LIFETIME_SECONDS = 24 * HOUR_SECONDS

/**
 * Returns whether a Topic Post's body images are public: the post is published on a public Topic. Any other post's
 * images are read by session or by signed url.
 */
export function isTopicPostPublic({ topicPost, topic }: TopicPostAccessRow): boolean {
	return topicPost.publishedAt !== null && topic.visibility === "public"
}

/**
 * Returns a body image path with a read signature that lasts a day past the next whole hour.
 */
export function toSignedTopicPostBodyImageUrl(path: string, nowMs = Date.now()): string {
	const expires = Math.ceil(nowMs / 1000 / HOUR_SECONDS) * HOUR_SECONDS + SIGNED_URL_LIFETIME_SECONDS
	return `${path}?expires=${expires}&signature=${toBodyImageSignature(path, expires)}`
}

// a read signature request's path and its two query values, as sent
export type TopicPostBodyImageSignatureOptions = {
	path: string
	expires: string | undefined
	signature: string | undefined
	nowMs?: number
}

/**
 * Returns whether a request's signature signs its path and an expiry that has not passed.
 */
export function isValidTopicPostBodyImageSignature({
	path,
	expires,
	signature,
	nowMs = Date.now(),
}: TopicPostBodyImageSignatureOptions): boolean {
	// an expiry is whole seconds that have not passed
	const expiresSeconds = Number(expires)
	if (!signature || !/^\d+$/.test(expires ?? "") || expiresSeconds * 1000 <= nowMs) {
		return false
	}
	return isSameSignature({ expectedSignature: toBodyImageSignature(path, expiresSeconds), signature })
}

// the signature of a path until an expiry
function toBodyImageSignature(path: string, expires: number): string {
	return toAuthSecretSignature({
		value: `${SIGNATURE_PURPOSE}|${path}|${expires}`,
		purpose: "body image urls",
		encoding: "base64url",
	})
}

// whether a reader's body urls are signed, and the site url an absolute src starts with
export type TopicPostHtmlForReaderOptions = { isSigned: boolean; siteUrl?: string }

/**
 * Returns a stored body as a reader gets it: each body image's src signed for a post that is not public, and absolute
 * for a reader outside the site.
 */
export function toTopicPostHtmlForReader(
	html: string,
	{ isSigned, siteUrl = "" }: TopicPostHtmlForReaderOptions,
): string {
	return html.replace(IMG_SRC_ATTRIBUTE_PATTERN, (match, opening: string, src: string, closing: string) => {
		// only a body image's path changes
		if (!fromTopicPostBodyImagePath(src)) {
			return match
		}
		const readerSrc = isSigned ? toSignedTopicPostBodyImageUrl(src).replace("&", "&amp;") : src
		return `${opening}${siteUrl}${readerSrc}${closing}`
	})
}

/**
 * Returns a saved body without the images an admin removed on a report, which an editor opened before the removal
 * still names.
 */
export async function loadHtmlWithoutRemovedBodyImages(html: string, topicPostId: string): Promise<string> {
	// a body with no image has nothing to remove
	if (toTopicPostBodyImageIds(html, topicPostId).length === 0) {
		return html
	}

	// each removed image comes out of the body
	let savedHtml = html
	for (const removedImageId of await loadRemovedTopicPostBodyImageIds(topicPostId)) {
		savedHtml = sanitizeTopicPostHtml(savedHtml, topicPostId, { removedImageId })
	}
	return savedHtml
}

/**
 * Returns a stored body without the images the reader reported, which they no longer see. Its author sees every image,
 * so the editor never saves one away.
 */
export async function loadTopicPostHtmlWithoutReportedImages(
	userId: string | null,
	{ topicPost }: Pick<TopicPostRow, "topicPost">,
): Promise<string> {
	// a visitor, the author, and a body with no image have nothing hidden
	const imageIds = toTopicPostBodyImageIds(topicPost.html, topicPost.id)
	if (!userId || userId === topicPost.authorUserId || imageIds.length === 0) {
		return topicPost.html
	}

	// each reported image comes out of the body
	let html = topicPost.html
	for (const reportedImageId of await loadReportedTopicPostBodyImageIds(userId, topicPost.id)) {
		html = sanitizeTopicPostHtml(html, topicPost.id, { removedImageId: reportedImageId })
	}
	return html
}

/**
 * Returns a body image's url as an upload returns it: signed if the post is not public.
 */
export function toUploadedTopicPostBodyImageUrl(topicPostRow: TopicPostRow, imageId: string): string {
	const path = toTopicPostBodyImagePath({ topicPostId: topicPostRow.topicPost.id, imageId })
	return isTopicPostPublic(topicPostRow) ? path : toSignedTopicPostBodyImageUrl(path)
}

/**
 * Counts a Topic Post's body images: those its saved body names, and its uploads still inside their grace.
 */
export async function loadTopicPostBodyImageCount(topicPostRow: TopicPostRow): Promise<number> {
	// the saved images by their ids, then each upload in grace by the id in its key
	const { id: topicPostId, html } = topicPostRow.topicPost
	const imageIds = new Set(toTopicPostBodyImageIds(html, topicPostId))
	const keyPrefix = toTopicPostBodyImageKeyPrefix(topicPostId)
	for (const uploadKey of await loadUploadKeysInGrace(keyPrefix)) {
		imageIds.add(uploadKey.slice(keyPrefix.length).split("/")[0] ?? "")
	}
	return imageIds.size
}

// the post a save wrote, its body before the save, and its body as saved
export type SettleTopicPostBodyImagesOptions = {
	topicPostId: string
	previousHtml: string
	savedHtml: string
	handle: DbHandle
}

/**
 * Settles a save's body images on the save's own transaction: the images it names that the body did not name before
 * keep their files, and the images the body named before and no longer names are queued for deletion now. Returns the
 * dropped images' ids.
 */
export async function settleTopicPostBodyImages({
	topicPostId,
	previousHtml,
	savedHtml,
	handle,
}: SettleTopicPostBodyImagesOptions): Promise<string[]> {
	// the images the body named before and names now, the ones the save added, and the ones it dropped
	const previousImageIds = toTopicPostBodyImageIds(previousHtml, topicPostId)
	const savedImageIds = toTopicPostBodyImageIds(savedHtml, topicPostId)
	const addedImageIds = savedImageIds.filter((imageId) => !previousImageIds.includes(imageId))
	const droppedImageIds = previousImageIds.filter((imageId) => !savedImageIds.includes(imageId))

	// an added image's files stay, which also takes back a deletion an earlier save queued, and a dropped image's go
	await clearPendingObjectDeletions(
		addedImageIds.flatMap((imageId) => toTopicPostBodyImageObjectKeys(topicPostId, imageId)),
		handle,
	)
	await recordPendingObjectDeletions({
		handle,
		objectKeys: droppedImageIds.flatMap((imageId) => toTopicPostBodyImageObjectKeys(topicPostId, imageId)),
	})
	return droppedImageIds
}

/**
 * Purges every image of a public Topic Post's Topic from the edge, its body images among them, after an image or the
 * post is removed.
 */
export async function purgeTopicPostBodyImagesAtEdge(
	topicPostRow: Pick<TopicPostRow, "topicPost" | "topic">,
): Promise<void> {
	if (isTopicPostPublic(topicPostRow)) {
		await purgeEdgeCacheTagAfterDeletion(toTopicImageCacheTag(topicPostRow.topic.id))
	}
}
