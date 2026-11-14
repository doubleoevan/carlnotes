// unchecked image path tests: the mark goes on an avatar path and an image file path, and only a relative api path
// whose own query names unchecked=1 reads as an unchecked image's
import { expect, test } from "bun:test"
import { toAvatarImagePath, toTeamAvatarImagePath } from "./avatars"
import { toTopicImageUrls, toTopicPodcastEpisodeVideoPosterUrl, toUncheckedTopicImageUrls } from "./topicImages"
import { isUncheckedImagePath, toUncheckedImagePath } from "./uncheckedImages"

test("the mark joins an avatar path's query and starts an image file path's", () => {
	expect(toUncheckedImagePath(toAvatarImagePath("user-1", "7b4c"))).toBe("/api/avatars/user-1?v=7b4c&unchecked=1")
	expect(toUncheckedImagePath(toTeamAvatarImagePath("team-1", "5e6f"))).toBe(
		"/api/team-avatars/team-1?v=5e6f&unchecked=1",
	)
	expect(toUncheckedImagePath(toTopicPodcastEpisodeVideoPosterUrl("episode-1", "hash-1"))).toBe(
		"/api/topic-podcast-episode-video-images/episode-1/hash-1/poster.jpg?unchecked=1",
	)
})

test("every url of an unchecked image is marked, and each reads as an unchecked image's path", () => {
	const uncheckedImage = toUncheckedTopicImageUrls(toTopicImageUrls("topic-1", "hash-1"))
	expect(uncheckedImage.page).toEqual({
		url: "/api/topic-images/topic-1/hash-1/page.webp?unchecked=1",
		url2x: "/api/topic-images/topic-1/hash-1/page@2x.webp?unchecked=1",
	})

	// all six files are marked
	const uncheckedImageUrls = Object.values(uncheckedImage).flatMap(({ url, url2x }) => [url, url2x])
	expect(uncheckedImageUrls).toHaveLength(6)
	expect(uncheckedImageUrls.every(isUncheckedImagePath)).toBe(true)
})

test("a published image's path is not an unchecked image's", () => {
	expect(isUncheckedImagePath(toAvatarImagePath("user-1", "7b4c"))).toBe(false)
	expect(isUncheckedImagePath(toTopicImageUrls("topic-1", "hash-1").page.url)).toBe(false)
})

test("an absolute url and a path outside the api are never an unchecked image's", () => {
	for (const value of [
		"https://images.example/api/avatars/user-1?v=7b4c&unchecked=1",
		"//images.example/api/avatars/user-1?unchecked=1",
		"/podcast-cover-placeholder.jpg?unchecked=1",
		"api/avatars/user-1?unchecked=1",
		"@images.example/api/avatars/user-1?unchecked=1",
	]) {
		expect(isUncheckedImagePath(value)).toBe(false)
	}
})

test("unchecked inside another parameter's value, another value, or the fragment is not the mark", () => {
	for (const value of [
		"/api/avatars/user-1?v=unchecked=1",
		"/api/avatars/user-1?next=%3Funchecked%3D1",
		"/api/avatars/user-1?v=7b4c&notunchecked=1",
		"/api/avatars/user-1?v=7b4c&unchecked=10",
		"/api/avatars/user-1?v=7b4c&unchecked=",
		"/api/avatars/user-1?v=7b4c#unchecked=1",
		"/api/avatars/user-1#?unchecked=1",
	]) {
		expect(isUncheckedImagePath(value)).toBe(false)
	}
})
