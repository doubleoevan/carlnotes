import { describe, expect, test } from "bun:test"
import { fromTopicImageFileName, toTopicImageUrls } from "./topicImages"

describe("topic image urls", () => {
	test("every size gets a 1x and a 2x path under the topic and its hash", () => {
		const urls = toTopicImageUrls("topic-1", "abc123")
		expect(urls.page).toEqual({
			url: "/api/topic-images/topic-1/abc123/page.webp",
			url2x: "/api/topic-images/topic-1/abc123/page@2x.webp",
		})
		expect(urls.thumbnail.url2x).toBe("/api/topic-images/topic-1/abc123/thumbnail@2x.webp")
	})

	test("a file name round-trips through its size and density", () => {
		expect(fromTopicImageFileName("list@2x.webp")).toEqual({ size: "list", density: 2 })
		expect(fromTopicImageFileName("page.webp")).toEqual({ size: "page", density: 1 })
		expect(fromTopicImageFileName("page@3x.webp")).toBeNull()
		expect(fromTopicImageFileName("original.jpg")).toBeNull()
	})
})
