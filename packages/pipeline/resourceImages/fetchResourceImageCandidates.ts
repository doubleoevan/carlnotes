// a page's images as candidates for its Resource's kept images: each image fetched through the public url guard,
// trying https first for an http url, and the page's link preview image from a YouTube video's thumbnail, a stored
// link preview, or the page's own tags

import { db } from "@carlnotes/db"
import { linkPreviews } from "@carlnotes/db/schema/chat"
import { getAttachmentBytes } from "@carlnotes/db/store"
import { and, eq, isNotNull } from "drizzle-orm"
import { fetchLinkPreviewImage, fetchLinkPreviewMetadata, toNormalizedLinkPreviewUrl } from "../linkPreview"
import { toYoutubeVideoId } from "../transcripts"
import { isRejectedImageUrl } from "./resourceImageCandidates"
import type { ResourceImageCandidate } from "./resourceImageFilter"

// the image types that are fetched. a gif and an svg never are
const RESOURCE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"])

// how large an image may be before its fetch is rejected
const RESOURCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024

/**
 * Fetches one image through the public url guard, trying https first for an http url. Returns null for a fetch that
 * fails, a type a film does not show, or an image that is too large.
 */
export async function fetchResourceImageCandidate(imageUrl: string): Promise<ResourceImageCandidate | null> {
	const httpsUrl = imageUrl.startsWith("http://") ? `https://${imageUrl.slice("http://".length)}` : null
	return (httpsUrl && (await fetchResourceImageUrl(httpsUrl))) || fetchResourceImageUrl(imageUrl)
}

// fetch one image at one url, or null for a fetch that fails
async function fetchResourceImageUrl(imageUrl: string): Promise<ResourceImageCandidate | null> {
	try {
		const { bytes } = await fetchLinkPreviewImage(imageUrl, RESOURCE_IMAGE_MAX_BYTES, RESOURCE_IMAGE_TYPES)
		return { sourceUrl: imageUrl, imageBytes: bytes, isLinkPreviewImage: false }
	} catch {
		return null
	}
}

/**
 * Returns a page's link preview image as a candidate: a YouTube video's largest thumbnail, the image that a stored
 * link preview holds, or else the image that the page's own tags name. Returns null for a page that offers none.
 */
export async function loadLinkPreviewImageCandidate(pageUrl: string): Promise<ResourceImageCandidate | null> {
	try {
		// a YouTube video's largest thumbnail, if the video has one
		const youtubeVideoId = toYoutubeVideoId(pageUrl)
		const youtubeThumbnail = youtubeVideoId
			? await fetchResourceImageCandidate(`https://i.ytimg.com/vi/${youtubeVideoId}/maxresdefault.jpg`)
			: null
		if (youtubeThumbnail) {
			return { ...youtubeThumbnail, isLinkPreviewImage: true }
		}

		// the image of the page's stored link preview
		const storedImageObjectKey = await loadStoredLinkPreviewImageKey(pageUrl)
		if (storedImageObjectKey) {
			const imageBytes = await getAttachmentBytes(storedImageObjectKey)
			return { sourceUrl: pageUrl, imageBytes, isLinkPreviewImage: true }
		}

		// otherwise the image the page's own tags name
		const { imageUrl } = await fetchLinkPreviewMetadata(pageUrl)
		const isImageUrlAllowed = imageUrl && !isRejectedImageUrl(imageUrl)
		const linkPreviewImage = isImageUrlAllowed ? await fetchResourceImageCandidate(imageUrl) : null
		return linkPreviewImage && { ...linkPreviewImage, isLinkPreviewImage: true }
	} catch {
		return null
	}
}

// the object key of the image a stored link preview holds for a page, or null if no ready link preview has one
async function loadStoredLinkPreviewImageKey(pageUrl: string): Promise<string | null> {
	// a ready link preview of the page's normalized url that has an image
	const isStoredWithImage = and(
		eq(linkPreviews.url, toNormalizedLinkPreviewUrl(pageUrl)),
		eq(linkPreviews.status, "ready"),
		isNotNull(linkPreviews.imageObjectKey),
	)
	const [storedLinkPreview] = await db
		.select({ imageObjectKey: linkPreviews.imageObjectKey })
		.from(linkPreviews)
		.where(isStoredWithImage)
	return storedLinkPreview?.imageObjectKey ?? null
}
