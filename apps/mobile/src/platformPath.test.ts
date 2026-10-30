import { expect, test } from "bun:test"
import { hasNativeRoute, toPlatformPath } from "./platformPath"

test("canonical topic and note links retain platform routes and page context", () => {
	expect(toPlatformPath("https://carlnotes.com/topics/topic-1/coffee?sort=oldest")).toBe("/topics/topic-1?sort=oldest")
	expect(toPlatformPath("https://carlnotes.com/topics/topic-1/notes/note-1")).toBe("/topics/topic-1/notes/note-1")
	expect(toPlatformPath("https://carlnotes.com/teams/team-1/notes/note-1")).toBe("/teams/team-1/notes/note-1")
})

test("public footer pages and unrelated sites retain their browser destinations", () => {
	expect(toPlatformPath("https://carlnotes.com/privacy")).toBe("https://carlnotes.com/privacy")
	expect(toPlatformPath("https://carlnotes.com/nightshift/")).toBe("https://carlnotes.com/nightshift/")
	expect(toPlatformPath("https://example.com/topics/topic-1")).toBe("https://example.com/topics/topic-1")
})

test("episode links retain season, number, and context before the generic Topic matcher", () => {
	for (const path of ["/topics/topic-1/stale-title/episodes/2026/7", "/topics/topic-1/episodes/2026/7/"]) {
		expect(toPlatformPath(`${path}?from=search#transcript`)).toBe(
			"/topics/topic-1/episodes/2026/7?from=search#transcript",
		)
	}
	expect(toPlatformPath("https://carlnotes.com/topics/topic-1/new-title/episodes/2026/7")).toBe(
		"/topics/topic-1/episodes/2026/7",
	)
	for (const url of [
		"https://example.test/topics/topic-1/title/episodes/2026/7",
		"https://carlnotes.com.evil.test/topics/topic-1/title/episodes/2026/7",
		"//example.test/topics/topic-1/episodes/2026/7",
	]) {
		expect(toPlatformPath(url)).toBe(url)
	}
})

test("hasNativeRoute is true for a native route path and false for any other", () => {
	for (const path of [
		"/",
		"/search?q=x",
		"/topics/t1",
		"/topics/t1/episodes/2026/7",
		"/teams/t1/notes/n1",
		"/invite/k",
	]) {
		expect(hasNativeRoute(path)).toBe(true)
	}
	for (const path of ["/terms", "/docs/quickstart", "/topics", "/topics/t1/something", "/admin"]) {
		expect(hasNativeRoute(path)).toBe(false)
	}
})
