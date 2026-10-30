// native intent tests: a visitor's link to an account screen opens sign-in and is remembered, every other link opens
import { expect, test } from "bun:test"
import { APP_LINK_SAMPLE_PATHS } from "@carlnotes/contracts/appLinkPaths"
import { SITE_URL } from "@carlnotes/contracts/site"
import { isSignedInPath, OPEN_WEB_PATH, toLinkedPath, toLinkedPathWithQuery } from "./nativeIntent"

// a scheme link and a web link both give their path with its query. a path is returned as given
test("a link's path comes without its scheme and host", () => {
	expect(toLinkedPathWithQuery("carlnotes://activity")).toBe("/activity")
	expect(toLinkedPathWithQuery("carlnotes:///teams/team-1/chat?chatTeamId=team-1")).toBe(
		"/teams/team-1/chat?chatTeamId=team-1",
	)
	expect(toLinkedPathWithQuery("https://carlnotes.com/invite/token-1")).toBe("/invite/token-1")
	expect(toLinkedPathWithQuery("/topics/topic-1")).toBe("/topics/topic-1")
})

// the account screens and the chat routes need a session, the reading pages do not
test("the account screens and chat routes are behind sign-in", () => {
	expect(isSignedInPath("/activity")).toBe(true)
	expect(isSignedInPath("/teams")).toBe(true)
	expect(isSignedInPath("/topics/topic-1/chat")).toBe(true)
	expect(isSignedInPath("/teams/team-1/chat?chatTeamId=team-1")).toBe(true)

	// the reading pages, the invitation, and Plans open to a visitor
	expect(isSignedInPath("/topics/topic-1")).toBe(false)
	expect(isSignedInPath("/teams/team-1")).toBe(false)
	expect(isSignedInPath("/invite/token-1")).toBe(false)
	expect(isSignedInPath("/plans")).toBe(false)
})

// a visitor's link to an account screen is remembered and opens sign-in. a user's opens as linked
test("a visitor's link to an account screen opens sign-in and is remembered", () => {
	const rememberedPaths: string[] = []
	const rememberReturnPath = (path: string): void => {
		rememberedPaths.push(path)
	}
	expect(toLinkedPath({ link: "carlnotes://activity", hasSession: false, rememberReturnPath })).toBe("/sign-in")
	expect(rememberedPaths).toEqual(["/activity"])

	// a user's link, a public link, and the development client's link open as given and remember nothing
	expect(toLinkedPath({ link: "/activity", hasSession: true, rememberReturnPath })).toBe("/activity")
	expect(toLinkedPath({ link: "/topics/topic-1", hasSession: false, rememberReturnPath })).toBe("/topics/topic-1")
	const developmentClientLink = "carlnotes://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082"
	expect(toLinkedPath({ link: developmentClientLink, hasSession: false, rememberReturnPath })).toBe(
		developmentClientLink,
	)
	expect(rememberedPaths).toEqual(["/activity"])
})

// every listed app link path reaches a native route, and a web url with no route opens in the browser
test("every app link path reaches a native route, and an unlisted web path opens in the browser", () => {
	const toPath = (path: string): string =>
		toLinkedPath({ link: `${SITE_URL}${path === "/" ? "" : path}`, hasSession: true, rememberReturnPath: () => {} })
	for (const samplePath of APP_LINK_SAMPLE_PATHS) {
		expect(toPath(samplePath).startsWith(OPEN_WEB_PATH)).toBe(false)
	}

	// a slugged Topic keeps its season, and an episode keeps its numbers
	expect(toPath("/topics/topic-1/coffee-slug?season=2")).toBe("/topics/topic-1?season=2")
	expect(toPath("/topics/topic-1/coffee-slug/episodes/2026/7")).toBe("/topics/topic-1/episodes/2026/7")

	// Terms has no native route
	expect(toPath("/terms")).toBe(`${OPEN_WEB_PATH}?url=${encodeURIComponent(`${SITE_URL}/terms`)}`)
})

// a visitor's web link to Activity is remembered as its native path and opens sign-in
test("a visitor's web link to an account screen is remembered as its path", () => {
	let rememberedPath = ""
	const path = toLinkedPath({
		link: `${SITE_URL}/activity`,
		hasSession: false,
		rememberReturnPath: (returnPath) => {
			rememberedPath = returnPath
		},
	})
	expect(path).toBe("/sign-in")
	expect(rememberedPath).toBe("/activity")
})
