// the response that serves one file of a topic's, a podcast episode's, a Topic Post's, or a film's image, gated by the
// topic's visibility, and the check that lets an unchecked image's files go to its uploader alone

import { attachmentStream } from "@carlnotes/db/store"
import { loadUncheckedImageForUploader, type UncheckedImageSubject } from "@carlnotes/db/uncheckedImages"
import { toTopicImageCacheTag } from "@carlnotes/server/edgePurge"
import type { Context } from "hono"
import { stream } from "hono/streaming"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import {
	LATEST_PRIVATE_IMAGE_HEADERS,
	PRIVATE_IMAGE_HEADERS,
	toVersionedImageHeaders,
	UNVERSIONED_CACHE_CONTROL,
} from "../edgeCache"
import type { NamedTopic } from "./permissions"

// the topic whose visibility gates the file, the object key of the file, its content type, which is webp if none is
// given, whether the url changes with the image, which it does if not given, and the read a caller already checked,
// which replaces the topic's gate and decides whether the edge may cache the file
export type ServeImageFileOptions = {
	topic: NamedTopic
	objectKey: string
	contentType?: string
	isUrlVersioned?: boolean
	checkedReadAccess?: "public" | "private"
}

// a file of the image a url names by its hash: the file to serve, the hash the url names, the hash of the subject's
// current image, and the subject whose unchecked image the hash may name
export type ServeCurrentOrUncheckedImageFileOptions = {
	imageFile: Pick<ServeImageFileOptions, "topic" | "objectKey" | "contentType">
	hash: string
	currentImageHash: string | null | undefined
	uncheckedImageSubject: UncheckedImageSubject
}

/**
 * Serves one file of the image a url names by its hash. The subject's current image goes to anyone who may see its
 * topic, and an unchecked upload of the signed-in user goes to them alone, with the headers of a file that never
 * reaches the edge. Any other hash is not found, and a visitor reads no unchecked image.
 */
export async function serveCurrentOrUncheckedImageFile(
	context: Context<AppEnv>,
	{ imageFile, hash, currentImageHash, uncheckedImageSubject }: ServeCurrentOrUncheckedImageFileOptions,
): Promise<Response> {
	if (currentImageHash === hash) {
		return serveImageFile(context, imageFile)
	}

	// the subject's unchecked image under this hash, which only its uploader reads
	const userId = currentUser(context)
	const uncheckedImage = userId ? await loadUncheckedImageForUploader(uncheckedImageSubject, userId) : null
	return uncheckedImage?.imageHash === hash
		? serveImageFile(context, { ...imageFile, checkedReadAccess: "private" })
		: context.json({ error: "not found" }, 404)
}

/**
 * Serves one image file under its topic's visibility: a public topic's file immutable at the edge under the topic's
 * tag, a non-public topic's file to a session the view gate grants and in the browser alone, and 404 otherwise. A file
 * at a url that keeps naming it through its changes is cached briefly instead.
 */
export async function serveImageFile(
	context: Context<AppEnv>,
	{ topic, objectKey, contentType = "image/webp", isUrlVersioned = true, checkedReadAccess }: ServeImageFileOptions,
): Promise<Response> {
	// a non-public topic's file goes to a session the view gate grants, and never to the edge
	const isPublic = checkedReadAccess ? checkedReadAccess === "public" : topic.visibility === "public"
	if (!checkedReadAccess && !isPublic && !(await isAllowed(currentUser(context), "topic:view", topic))) {
		return context.json({ error: "not found" }, 404)
	}

	// a public file is immutable at the edge under the topic's tag, and a private one in the browser alone. a url
	// that names no version is cached for an hour, or for a minute in the browser alone
	const publicCacheHeaders = isUrlVersioned
		? toVersionedImageHeaders(true)
		: { "Cache-Control": UNVERSIONED_CACHE_CONTROL }
	const privateCacheHeaders = isUrlVersioned ? PRIVATE_IMAGE_HEADERS : LATEST_PRIVATE_IMAGE_HEADERS

	// set the headers of the topic's visibility, with the topic's tag on a public file
	const headers = isPublic
		? { ...publicCacheHeaders, "Cache-Tag": toTopicImageCacheTag(topic.id) }
		: privateCacheHeaders
	for (const [headerName, headerValue] of Object.entries(headers)) {
		context.header(headerName, headerValue)
	}

	// the file's bytes stream from object storage in its content type
	context.header("Content-Type", contentType)
	return stream(context, (responseStream) => responseStream.pipe(attachmentStream(objectKey)))
}
