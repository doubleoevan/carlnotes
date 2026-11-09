// the response that serves one derived file of a topic's or a podcast episode's image, gated by the topic's visibility

import { attachmentStream } from "@carlnotes/db/store"
import { toTopicImageCacheTag } from "@carlnotes/server/edgePurge"
import type { Context } from "hono"
import { stream } from "hono/streaming"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { PRIVATE_IMAGE_HEADERS, toVersionedImageHeaders } from "../edgeCache"
import type { NamedTopic } from "./permissions"

// the topic whose visibility gates the file, and the object key of the file
export type ServeImageFileOptions = { topic: NamedTopic; objectKey: string }

/**
 * Serves one derived webp file under its topic's visibility: a public topic's file immutable at the edge under the
 * topic's tag, a non-public topic's file to a session the view gate grants and in the browser alone, and 404 otherwise.
 */
export async function serveImageFile(
	context: Context<AppEnv>,
	{ topic, objectKey }: ServeImageFileOptions,
): Promise<Response> {
	// a non-public topic's file goes to a session the view gate grants, and never to the edge
	const isPublic = topic.visibility === "public"
	if (!isPublic && !(await isAllowed(currentUser(context), "topic:view", topic))) {
		return context.json({ error: "not found" }, 404)
	}

	// a public file is immutable at the edge under the topic's tag, and a private one in the browser alone
	const headers = isPublic
		? { ...toVersionedImageHeaders(true), "Cache-Tag": toTopicImageCacheTag(topic.id) }
		: PRIVATE_IMAGE_HEADERS
	for (const [headerName, headerValue] of Object.entries(headers)) {
		context.header(headerName, headerValue)
	}

	// the file's bytes stream from object storage as webp
	context.header("Content-Type", "image/webp")
	return stream(context, (responseStream) => responseStream.pipe(attachmentStream(objectKey)))
}
