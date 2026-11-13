// Topic Post object key tests: a post's delete reads its cover's files, its saved body images' files, and its
// discussions' audio
import { afterEach, expect, test } from "bun:test"
import { toTopicPostBodyImagePath } from "@carlnotes/contracts/topicPostBodyImages"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { loadTopicPostObjectKeys } from "./topicPostObjectKeys"

// put the pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

test("a post's keys hold its cover's files, every body image its saved body shows, and its discussion's audio", async () => {
	// a post with a cover and a body that shows two images, one of them twice, and a recorded discussion
	const topicPostId = crypto.randomUUID()
	const [firstImageId, secondImageId] = [crypto.randomUUID(), crypto.randomUUID()]
	const toImageHtml = (imageId: string): string =>
		`<img src="${toTopicPostBodyImagePath({ topicPostId, imageId })}" width="4" height="3" />`
	const html = `<p>one</p>${toImageHtml(firstImageId)}${toImageHtml(secondImageId)}${toImageHtml(firstImageId)}`
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "topic_post_discussions"') ? [["discussion-audio.mp3"]] : [[topicPostId, "hash-1", html]],
	)
	const objectKeys = await loadTopicPostObjectKeys({ topicPostId })

	// each body image's file once, beside the cover's files and the audio
	for (const imageId of [firstImageId, secondImageId]) {
		expect(objectKeys).toContain(`topic-post-body-images/${topicPostId}/${imageId}/column.webp`)
	}
	expect(objectKeys.filter((objectKey) => objectKey.startsWith("topic-post-body-images/"))).toHaveLength(2)
	expect(objectKeys.some((objectKey) => objectKey.includes("hash-1"))).toBe(true)
	expect(objectKeys).toContain("discussion-audio.mp3")

	// the posts read is limited to those with a cover or a body image, and the body is read only for a body image
	const postQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('"image_hash" is not null'))
	expect(postQuery?.text).toContain(" like ")
	expect(postQuery?.text).toContain('case when "topic_posts"."html" like')
})
