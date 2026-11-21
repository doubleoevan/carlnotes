// a url's page search params: a page past the first is kept under its key, and anything else reads as the first page
import { expect, test } from "bun:test"
import { toPageSearch } from "./pageSearch"

test("a page past the first is kept, and a first page, a missing key, or a value that is not a page is left out", () => {
	const search = { newPosts: "3", newFilms: 1, newPodcasts: "two", posts: "2.5", other: "4" }
	expect(toPageSearch(search, ["newPosts", "newFilms", "newPodcasts", "posts", "missing"])).toEqual({ newPosts: 3 })
})

test("a page past the card pages' limit is left out", () => {
	expect(toPageSearch({ newPosts: "10001", newFilms: "10002" }, ["newPosts", "newFilms"])).toEqual({ newPosts: 10_001 })
})
