// tests for reading a Topic Post body's image ids: each image of the post once, by its path, signed or not, and no
// image from a src that is not a url or names another post
import { expect, test } from "bun:test"
import { toTopicPostBodyImageIds, toTopicPostBodyImagePath } from "./topicPostBodyImages"

// a post and two of its images, by the uuids their paths take
const TOPIC_POST_ID = "11111111-1111-4111-8111-111111111111"
const FIRST_IMAGE_ID = "22222222-2222-4222-8222-222222222222"
const SECOND_IMAGE_ID = "33333333-3333-4333-8333-333333333333"

test("a body names each of its post's images once, signed or not, and no other post's", () => {
	// the first image twice, once signed at the site's origin, then the second, then another post's image
	const firstPath = toTopicPostBodyImagePath({ topicPostId: TOPIC_POST_ID, imageId: FIRST_IMAGE_ID })
	const secondPath = toTopicPostBodyImagePath({ topicPostId: TOPIC_POST_ID, imageId: SECOND_IMAGE_ID })
	const otherPath = toTopicPostBodyImagePath({ topicPostId: SECOND_IMAGE_ID, imageId: FIRST_IMAGE_ID })
	const html = `<img src="${firstPath}"><img src="https://carlnotes.com${firstPath}?expires=1&amp;signature=s"><img src="${secondPath}"><img src="${otherPath}">`
	expect(toTopicPostBodyImageIds(html, TOPIC_POST_ID)).toEqual([FIRST_IMAGE_ID, SECOND_IMAGE_ID])
})

test("a src that is not a url names no image", () => {
	expect(toTopicPostBodyImageIds('<img src="http://"><img src="https://">', TOPIC_POST_ID)).toEqual([])
})
