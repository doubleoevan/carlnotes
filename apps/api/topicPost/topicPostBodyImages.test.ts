// Topic Post body image tests: the read signature, the html each reader gets, the file read for a public post, a
// private post, and a signed url, and the author's upload with its type, size, count, and moderation checks
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { toTopicPostBodyImagePath } from "@carlnotes/contracts/topicPostBodyImages"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as quotas from "@carlnotes/db/quotas"
import * as store from "@carlnotes/db/store"
import * as topicPostBodyImageFiles from "@carlnotes/pipeline/topicPosts/topicPostBodyImageFiles"
import { ONE_PIXEL_PNG_BYTES, toBombPng } from "@carlnotes/pipeline/topicPosts/topicPostBodyImageTestFixtures"
import * as edgePurge from "@carlnotes/server/edgePurge"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"

import * as authorization from "../authorization"
import * as moderation from "../moderation"
import { toSignedInApp } from "../testSession"
import { removeReportedTopicPostBodyImage } from "./topicPostBodyImageReports"
import {
	isValidTopicPostBodyImageSignature,
	toSignedTopicPostBodyImageUrl,
	toTopicPostHtmlForReader,
} from "./topicPostBodyImages"
import { topicPostImagesRoute } from "./topicPostImagesRoute"
import type { TopicPostRow } from "./topicPosts"
import * as topicPosts from "./topicPosts"

// the signing secret, set before each test
const restoreEnvSettings = saveEnvSettings(["BETTER_AUTH_SECRET"])
beforeEach(() => {
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
})

// put the secret, the pool, and every spy back after each test
afterEach(() => {
	restoreEnvSettings()
	restoreConnectionPool()
	mock.restore()
})

// a post, one saved image in its body, and an author of this run's own, so the upload limiter counts this run alone
const TOPIC_POST_ID = "11111111-1111-4111-8111-111111111111"
const IMAGE_ID = "22222222-2222-4222-8222-222222222222"
const IMAGE_PATH = toTopicPostBodyImagePath({ topicPostId: TOPIC_POST_ID, imageId: IMAGE_ID })
const AUTHOR_ID = `author-${crypto.randomUUID()}`

// a file's url as the image route reads it, after the /api base
function toRoutePath(url: string): string {
	return url.replace(/^\/api/, "")
}

// a published post on a public Topic whose body shows the saved image
const TOPIC_POST_ROW = {
	topicPost: {
		id: TOPIC_POST_ID,
		topicId: "topic-1",
		authorUserId: AUTHOR_ID,
		publishedAt: new Date(),
		html: `<p>Look</p><img src="${IMAGE_PATH}" alt="" width="800" height="600">`,
		version: 4,
	},
	topic: {
		id: "topic-1",
		ownerId: "owner-1",
		visibility: "public",
		teamId: "team-1",
		name: "Espresso",
		imageHash: null,
	},
	author: { userId: AUTHOR_ID, username: "author", avatarSource: "generated", avatarKey: null },
} as TopicPostRow

// the same post on a private Topic
const PRIVATE_TOPIC_POST_ROW = {
	...TOPIC_POST_ROW,
	topic: { ...TOPIC_POST_ROW.topic, visibility: "private" },
} as TopicPostRow

// the post's reads, with an image saved if the body names its path, and the stored file's bytes
function stubTopicPost(topicPostRow: TopicPostRow = TOPIC_POST_ROW): void {
	stubConnectionPool()
	spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(topicPostRow)
	spyOn(topicPosts, "loadTopicPostBodyImageAccessRow").mockImplementation(async (topicPostId, imageId) => ({
		...topicPostRow,
		isImageSaved: topicPostRow.topicPost.html.includes(`/${topicPostId}/${imageId}/`),
	}))
	spyOn(store, "attachmentStream").mockReturnValue(new Blob([new Uint8Array([1, 2, 3])]).stream())
}

test("a body image read searches the body for the image's path in the database and never reads the body", async () => {
	const sentQueries = stubConnectionPool()
	await topicPosts.loadTopicPostBodyImageAccessRow(TOPIC_POST_ID, IMAGE_ID)
	expect(sentQueries[0]?.text).toContain('position($1 in "topic_posts"."html")')
	expect(sentQueries[0]?.text).not.toContain('"topic_posts"."html",')
	expect(sentQueries[0]?.values).toContain(`/api/topic-post-body-images/${TOPIC_POST_ID}/${IMAGE_ID}/`)
})

test("a signature reads its own path until it expires, and an altered path or signature reads nothing", () => {
	// a url signed now, split into its query values
	const nowMs = Date.UTC(2026, 10, 12, 10, 20)
	const signedUrl = new URL(toSignedTopicPostBodyImageUrl(IMAGE_PATH, nowMs), "http://localhost")
	const expires = signedUrl.searchParams.get("expires") ?? undefined
	const signature = signedUrl.searchParams.get("signature") ?? undefined

	// the expiry is a day past the next whole hour, so a url holds for the hour it is cached
	expect(Number(expires)).toBe(Date.UTC(2026, 10, 13, 11) / 1000)
	expect(isValidTopicPostBodyImageSignature({ path: IMAGE_PATH, expires, signature, nowMs })).toBe(true)

	// past its expiry, at another path, with another expiry, or altered, it reads nothing
	const afterExpiryMs = Number(expires) * 1000 + 1
	expect(isValidTopicPostBodyImageSignature({ path: IMAGE_PATH, expires, signature, nowMs: afterExpiryMs })).toBe(false)
	const otherPath = IMAGE_PATH.replace("column.webp", "original.webp")
	expect(isValidTopicPostBodyImageSignature({ path: otherPath, expires, signature, nowMs })).toBe(false)
	const laterExpires = String(Number(expires) + 3600)
	expect(isValidTopicPostBodyImageSignature({ path: IMAGE_PATH, expires: laterExpires, signature, nowMs })).toBe(false)
	expect(isValidTopicPostBodyImageSignature({ path: IMAGE_PATH, expires, signature: `${signature}x`, nowMs })).toBe(
		false,
	)
	expect(isValidTopicPostBodyImageSignature({ path: IMAGE_PATH, expires: "soon", signature, nowMs })).toBe(false)
})

test("a reader's html signs a private post's image srcs, and an outside reader's srcs are absolute", () => {
	const { html } = TOPIC_POST_ROW.topicPost

	// a public post's html is the stored body
	expect(toTopicPostHtmlForReader(html, { isSigned: false })).toBe(html)

	// a private post's src is signed, with its ampersand written as html writes one
	const signedHtml = toTopicPostHtmlForReader(html, { isSigned: true })
	expect(signedHtml).toMatch(new RegExp(`src="${IMAGE_PATH}\\?expires=\\d+&amp;signature=[\\w-]+"`))

	// an outside reader's src starts with the site
	const absoluteHtml = toTopicPostHtmlForReader(html, { isSigned: true, siteUrl: "https://carlnotes.com" })
	expect(absoluteHtml).toContain(`src="https://carlnotes.com${IMAGE_PATH}?expires=`)
})

test("a public post's saved image is served to a visitor, cached at the edge under its Topic", async () => {
	stubTopicPost()
	const response = await topicPostImagesRoute.request(toRoutePath(IMAGE_PATH))
	expect(response.status).toBe(200)
	expect(response.headers.get("content-type")).toBe("image/webp")
	expect(response.headers.get("cache-tag")).toBe("topic-image:topic-1")
})

test("a private post's image needs a session that may read it or a valid signature", async () => {
	stubTopicPost(PRIVATE_TOPIC_POST_ROW)
	spyOn(authorization, "isAllowed").mockResolvedValue(false)

	// no session, an expired signature, and an altered one are not found
	expect((await topicPostImagesRoute.request(toRoutePath(IMAGE_PATH))).status).toBe(404)
	const expiredUrl = toSignedTopicPostBodyImageUrl(IMAGE_PATH, Date.now() - 3 * 24 * 60 * 60 * 1000)
	expect((await topicPostImagesRoute.request(toRoutePath(expiredUrl))).status).toBe(404)
	const signedUrl = toSignedTopicPostBodyImageUrl(IMAGE_PATH)
	expect((await topicPostImagesRoute.request(toRoutePath(`${signedUrl}x`))).status).toBe(404)

	// a valid signature reads the file, which stays out of the edge
	const signedResponse = await topicPostImagesRoute.request(toRoutePath(signedUrl))
	expect(signedResponse.status).toBe(200)
	expect(signedResponse.headers.get("cache-tag")).toBeNull()
	expect(signedResponse.headers.get("cache-control")).toContain("private")
})

test("an upload the body does not name is its author's alone, and a path naming no file is not found", async () => {
	stubTopicPost()
	const unsavedPath = toTopicPostBodyImagePath({ topicPostId: TOPIC_POST_ID, imageId: crypto.randomUUID() })

	// a visitor reads nothing of it, and its author reads it by session
	expect((await topicPostImagesRoute.request(toRoutePath(unsavedPath))).status).toBe(404)
	expect((await toSignedInApp(topicPostImagesRoute, AUTHOR_ID).request(toRoutePath(unsavedPath))).status).toBe(200)

	// an image id that is not a uuid and a file of no allowed name are not found
	expect((await topicPostImagesRoute.request(toRoutePath(IMAGE_PATH.replace(IMAGE_ID, "image-1")))).status).toBe(404)
	expect(
		(await topicPostImagesRoute.request(toRoutePath(IMAGE_PATH.replace("column.webp", "column.svg")))).status,
	).toBe(404)
})

// the author's upload of a file's bytes, declared as a png
function upload(fileBytes: Uint8Array, userId = AUTHOR_ID): Promise<Response> {
	const formData = new FormData()
	formData.set("image", new File([new Uint8Array(fileBytes)], "photo.png", { type: "image/png" }))
	return Promise.resolve(
		toSignedInApp(topicPostImagesRoute, userId).request(`/topic-posts/${TOPIC_POST_ID}/body-images`, {
			method: "POST",
			body: formData,
		}),
	)
}

// an author who may edit, on the free plan's limits, with no uploads in grace and the storage stubbed
function stubUpload(topicPostRow: TopicPostRow = TOPIC_POST_ROW): ReturnType<typeof spyOn> {
	stubTopicPost(topicPostRow)
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(quotas, "loadTopicPostBodyImageLimits").mockResolvedValue({ imageLimit: 5, imageBytes: 5 * 1024 * 1024 })
	spyOn(store, "loadUploadKeysInGrace").mockResolvedValue([])
	return spyOn(topicPostBodyImageFiles, "storeTopicPostBodyImage").mockResolvedValue()
}

test("a clean upload is stored and returns the url the editor inserts, signed for a private post", async () => {
	const storeSpy = stubUpload(PRIVATE_TOPIC_POST_ROW)
	spyOn(moderation, "toStrictImageModeration").mockResolvedValue({ outcome: "clean" })

	// the url names a new image of the post, signed, at the column copy's size
	const response = await upload(ONE_PIXEL_PNG_BYTES)
	expect(response.status).toBe(200)
	const { url, width, height } = (await response.json()) as { url: string; width: number; height: number }
	expect(url).toMatch(/^\/api\/topic-post-body-images\/[\w-]+\/[\w-]+\/column\.webp\?expires=\d+&signature=/)
	expect({ width, height }).toEqual({ width: 1, height: 1 })
	expect(storeSpy).toHaveBeenCalledTimes(1)
})

test("an svg and an html file declared as a png are rejected by their bytes, and nothing is stored", async () => {
	const storeSpy = stubUpload()
	const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
	expect(await (await upload(svgBytes)).json()).toEqual({ error: "unsupported-type" })
	expect((await upload(new TextEncoder().encode("<html><body>photo</body></html>"))).status).toBe(400)
	expect(storeSpy).not.toHaveBeenCalled()
})

test("a decompression bomb is too large before it decodes", async () => {
	const storeSpy = stubUpload()
	const response = await upload(toBombPng(50_000))
	expect(response.status).toBe(413)
	expect(await response.json()).toEqual({ error: "too-large" })
	expect(storeSpy).not.toHaveBeenCalled()
})

test("a moderation check that fails or is skipped stores nothing, and a violation is rejected", async () => {
	const storeSpy = stubUpload()
	const moderationSpy = spyOn(moderation, "toStrictImageModeration").mockResolvedValue({ outcome: "unavailable" })

	// no verdict is a 503 the editor offers to retry
	const unavailable = await upload(ONE_PIXEL_PNG_BYTES)
	expect(unavailable.status).toBe(503)
	expect(await unavailable.json()).toEqual({ error: "moderation-unavailable" })

	// a violation names its category
	moderationSpy.mockResolvedValue({ outcome: "objectionable", category: "sexual" })
	expect((await upload(ONE_PIXEL_PNG_BYTES)).status).toBe(422)
	expect(storeSpy).not.toHaveBeenCalled()
})

test("an upload past the plan's file size or its count of images is rejected before it decodes", async () => {
	const storeSpy = stubUpload()
	const decodeSpy = spyOn(topicPostBodyImageFiles, "toTopicPostBodyImage")

	// a file past the plan's size
	spyOn(quotas, "loadTopicPostBodyImageLimits").mockResolvedValue({ imageLimit: 5, imageBytes: 10 })
	expect((await upload(ONE_PIXEL_PNG_BYTES)).status).toBe(413)

	// a post at its limit, counting its one saved image and one upload in grace
	spyOn(quotas, "loadTopicPostBodyImageLimits").mockResolvedValue({ imageLimit: 2, imageBytes: 5 * 1024 * 1024 })
	spyOn(store, "loadUploadKeysInGrace").mockResolvedValue([
		`topic-post-body-images/${TOPIC_POST_ID}/${crypto.randomUUID()}/column.webp`,
	])
	const atLimit = await upload(ONE_PIXEL_PNG_BYTES)
	expect(atLimit.status).toBe(422)
	expect(await atLimit.json()).toEqual({ error: "image-limit-reached" })
	expect(decodeSpy).not.toHaveBeenCalled()
	expect(storeSpy).not.toHaveBeenCalled()
})

test("an editor of the Topic who did not write the post uploads nothing to it", async () => {
	const storeSpy = stubUpload()
	expect((await upload(ONE_PIXEL_PNG_BYTES, `editor-${crypto.randomUUID()}`)).status).toBe(404)
	expect(storeSpy).not.toHaveBeenCalled()
})

test("an admin's removal takes a reported image out of the body at the next version and queues its files", async () => {
	// the post's read, and the write, the queue, and the purges the removal sends
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('update "topic_posts"') ? [[TOPIC_POST_ID]] : [],
	)
	spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(TOPIC_POST_ROW)
	const recordSpy = spyOn(store, "recordPendingObjectDeletions").mockResolvedValue()
	const purgeSpy = spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue()
	await removeReportedTopicPostBodyImage(`${TOPIC_POST_ID}/${IMAGE_ID}`)

	// the body keeps its text and loses the image, at the next version, written only at the version that was read
	const postUpdate = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "topic_posts"'))
	expect(postUpdate?.text).toContain('"version" + 1')
	expect(postUpdate?.values).toContain(TOPIC_POST_ROW.topicPost.version)
	expect(postUpdate?.values).toContain("<p>Look</p>")
	expect(recordSpy.mock.calls[0]?.[0]).toMatchObject({
		objectKeys: [`topic-post-body-images/${TOPIC_POST_ID}/${IMAGE_ID}/column.webp`],
	})

	// the public post's page and its Topic's images leave the edge
	expect(purgeSpy).toHaveBeenCalledWith(`topic-post:${TOPIC_POST_ID}`)
	expect(purgeSpy).toHaveBeenCalledWith("topic-image:topic-1")
})

test("a save that lands between a removal's read and its write sends the removal back to read the post again", async () => {
	// the first write misses the version, and the second holds
	let updateCount = 0
	const sentQueries = stubConnectionPool(({ text }) => {
		if (!text.startsWith('update "topic_posts"')) {
			return []
		}
		updateCount++
		return updateCount === 1 ? [] : [[TOPIC_POST_ID]]
	})

	// the post's reads, the queue, and the purges
	const loadSpy = spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(TOPIC_POST_ROW)
	spyOn(store, "recordPendingObjectDeletions").mockResolvedValue()
	spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue()

	// the removal, then the post read again before the second write
	await removeReportedTopicPostBodyImage(`${TOPIC_POST_ID}/${IMAGE_ID}`)
	expect(loadSpy).toHaveBeenCalledTimes(2)
	expect(sentQueries.filter((sentQuery) => sentQuery.text.startsWith('update "topic_posts"'))).toHaveLength(2)
})

test("a removal whose post or image is already gone writes nothing, and an image already gone is purged again", async () => {
	const sentQueries = stubConnectionPool()
	const recordSpy = spyOn(store, "recordPendingObjectDeletions").mockResolvedValue()
	const purgeSpy = spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue()

	// a post that is gone, then an image its body no longer shows
	const loadSpy = spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(null)
	await removeReportedTopicPostBodyImage(`${TOPIC_POST_ID}/${IMAGE_ID}`)
	loadSpy.mockResolvedValue(TOPIC_POST_ROW)
	await removeReportedTopicPostBodyImage(`${TOPIC_POST_ID}/${crypto.randomUUID()}`)
	expect(sentQueries).toHaveLength(0)
	expect(recordSpy).not.toHaveBeenCalled()

	// the image already gone from a public post's body leaves the edge again, in case an earlier purge failed
	expect(purgeSpy).toHaveBeenCalledWith(`topic-post:${TOPIC_POST_ID}`)
	expect(purgeSpy).toHaveBeenCalledWith("topic-image:topic-1")
})
