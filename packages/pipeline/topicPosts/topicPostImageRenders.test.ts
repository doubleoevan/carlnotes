// Topic Post image replace tests: the post's page and its replaced files leave the edge after a regenerate and an
// upload, and a private Topic's post and an unchanged image purge nothing
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as edgePurge from "@carlnotes/server/edgePurge"
import { replaceTopicPostImage } from "./topicPostImageRenders"

// put back the connection pool and the module mocks after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the post's read inside the replace: the image it had, and its Topic with its visibility
function stubTopicPost(previousHash: string | null, visibility: "public" | "private"): ReturnType<typeof spyOn> {
	stubConnectionPool(({ text }) => (text.startsWith("select") ? [[previousHash, "topic-1", visibility]] : []))
	return spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue()
}

// a regenerate's replace, which closes its render, and an upload's, which has none
const REGENERATE = {
	topicPostId: "post-1",
	renderId: "render-1",
	origin: "generated",
	imagePrompt: null,
	costDollars: 0.04,
} as const
const UPLOAD = { topicPostId: "post-1", renderId: null, origin: "uploaded", imagePrompt: null, costDollars: 0 } as const

test("a regenerate and an upload each purge the post's page tag, and the replaced files' tag", async () => {
	const purgeSpy = stubTopicPost("old-hash", "public")
	await replaceTopicPostImage({ ...REGENERATE, hash: "new-hash" })
	expect(purgeSpy.mock.calls).toEqual([["topic-post:post-1"], ["topic-image:topic-1"]])

	// an upload over the regenerated image
	purgeSpy.mockClear()
	await replaceTopicPostImage({ ...UPLOAD, hash: "upload-hash" })
	expect(purgeSpy.mock.calls).toEqual([["topic-post:post-1"], ["topic-image:topic-1"]])
})

test("a first image purges the page alone, since no file was replaced", async () => {
	const purgeSpy = stubTopicPost(null, "public")
	await replaceTopicPostImage({ ...REGENERATE, hash: "new-hash" })
	expect(purgeSpy.mock.calls).toEqual([["topic-post:post-1"]])
})

test("a private Topic's post, and an image that came back under its own hash, purge nothing", async () => {
	const privatePurgeSpy = stubTopicPost("old-hash", "private")
	await replaceTopicPostImage({ ...REGENERATE, hash: "new-hash" })
	expect(privatePurgeSpy).not.toHaveBeenCalled()

	// the same bytes under the same hash
	const sameHashPurgeSpy = stubTopicPost("same-hash", "public")
	await replaceTopicPostImage({ ...UPLOAD, hash: "same-hash" })
	expect(sameHashPurgeSpy).not.toHaveBeenCalled()
})
