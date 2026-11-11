import { expect, test } from "bun:test"
import { isCurrentPagePath } from "./pagePaths"

// the topic page's path that the cases share
const TOPIC_PATH = "/topics/t1/keeping-up"

test("a path is the open page's path with or without a query, a hash, and an end slash", () => {
	expect(isCurrentPagePath({ path: TOPIC_PATH, currentPath: TOPIC_PATH })).toBe(true)
	expect(isCurrentPagePath({ path: `${TOPIC_PATH}?section=posts#top`, currentPath: `${TOPIC_PATH}/` })).toBe(true)
	expect(isCurrentPagePath({ path: "/", currentPath: "/?featured=2" })).toBe(true)
})

test("another page's path, a page after the open page, and the page before it are not the open page's path", () => {
	expect(isCurrentPagePath({ path: "/topics/t2/other", currentPath: TOPIC_PATH })).toBe(false)
	expect(isCurrentPagePath({ path: `${TOPIC_PATH}/posts/p1/first`, currentPath: TOPIC_PATH })).toBe(false)
	expect(isCurrentPagePath({ path: TOPIC_PATH, currentPath: `${TOPIC_PATH}/posts/p1/first` })).toBe(false)
})
