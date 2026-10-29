// native intent tests: a visitor's link to an account screen opens sign-in and is remembered, every other link opens
import { expect, test } from "bun:test"
import { isSignedInPath, toLinkedPath, toLinkedPathWithQuery } from "./nativeIntent"

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
