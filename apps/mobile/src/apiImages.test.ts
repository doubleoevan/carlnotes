// api image tests: only an unchecked image's path loads with the session cookie and stores nothing, every other value
// loads as a bare url, and an avatar loads an unchecked version at its marked path alone

import { afterEach, beforeEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import { toAvatarImagePath, toTeamAvatarImagePath } from "@carlnotes/contracts/avatars"
import { toTopicImageUrls, toUncheckedTopicImageUrls } from "@carlnotes/contracts/topicImages"
import { toUncheckedImagePath } from "@carlnotes/contracts/uncheckedImages"
import { toApiImageProps, toShownAvatarImagePath } from "./apiImages"

// the app's api, and the session cookie the app stores
const API_BASE_URL = "https://carlnotes.example"
const SESSION_COOKIE = "better-auth.session_token=abc"

// point the client at the app's api before each test, and back at the page's own origin after
beforeEach(() => {
	configureApiClient({ apiBaseUrl: API_BASE_URL, showError: () => {} })
})
afterEach(() => {
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

test("an avatar without the unchecked mark loads as a bare url, with no header and the usual storing", () => {
	const avatarPath = toAvatarImagePath("user-1", "7b4c")
	expect(toApiImageProps(avatarPath, SESSION_COOKIE)).toEqual({ source: { uri: `${API_BASE_URL}${avatarPath}` } })
	expect(toApiImageProps(avatarPath, null)).toEqual({ source: { uri: `${API_BASE_URL}${avatarPath}` } })
})

test("an unchecked image's path loads with the session cookie and stores nothing", () => {
	// an unchecked avatar and an unchecked topic image's file
	const uncheckedAvatarPath = toUncheckedImagePath(toAvatarImagePath("user-1", "7b4c"))
	const uncheckedImagePath = toUncheckedTopicImageUrls(toTopicImageUrls("topic-1", "unchecked-hash")).page.url2x
	for (const uncheckedPath of [uncheckedAvatarPath, uncheckedImagePath]) {
		expect(toApiImageProps(uncheckedPath, SESSION_COOKIE)).toEqual({
			source: { uri: `${API_BASE_URL}${uncheckedPath}`, headers: { cookie: SESSION_COOKIE } },
			cachePolicy: "none",
		})
	}

	// no request for an unchecked image goes out until the cookie is read
	expect(toApiImageProps(uncheckedAvatarPath, null)).toBeNull()
})

test("an absolute url, a path outside the api, and unchecked inside another parameter's value get a bare url", () => {
	for (const value of [
		"https://images.example/api/avatars/user-1?v=7b4c&unchecked=1",
		"/podcast-cover-placeholder.jpg?unchecked=1",
		"/api/avatars/user-1?v=unchecked=1",
	]) {
		expect(toApiImageProps(value, SESSION_COOKIE)).toEqual({ source: { uri: `${API_BASE_URL}${value}` } })
	}
})

test("an image that was unchecked loads at its plain url with no cookie once it is published", () => {
	const publishedImagePath = toTopicImageUrls("topic-1", "unchecked-hash").page.url2x
	expect(toApiImageProps(publishedImagePath, SESSION_COOKIE)).toEqual({
		source: { uri: `${API_BASE_URL}${publishedImagePath}` },
	})
})

// user-1's session while an avatar upload of theirs is unchecked at the version 7b4c
const UNCHECKED_SESSION_USER = { id: "user-1", uncheckedAvatarKey: "avatars/user-1/7b4c.png" }
const OWN_UNCHECKED_AVATAR_PATH = "/api/avatars/user-1?v=7b4c&unchecked=1"

test("the signed-in user's own avatar loads their unchecked upload at its marked path, wherever it is drawn", () => {
	// drawn from the session at the unchecked version, from a page at the published version, and from the initials
	for (const imagePath of [toAvatarImagePath("user-1", "7b4c"), toAvatarImagePath("user-1", "3f2a"), null]) {
		const shownAvatarImagePath = toShownAvatarImagePath({
			imagePath,
			ownerId: "user-1",
			isUnchecked: false,
			sessionUser: UNCHECKED_SESSION_USER,
		})
		expect(shownAvatarImagePath).toBe(OWN_UNCHECKED_AVATAR_PATH)
	}
})

test("every other avatar loads the path it was given, with no mark", () => {
	// another person's avatar while the signed-in user has an unchecked upload, and the user's own with none unchecked
	const otherAvatarPath = toAvatarImagePath("user-2", "9c1b")
	const ownAvatarPath = toAvatarImagePath("user-1", "3f2a")
	const unmarkedAvatars = [
		{ imagePath: otherAvatarPath, ownerId: "user-2", sessionUser: UNCHECKED_SESSION_USER },
		{ imagePath: ownAvatarPath, ownerId: "user-1", sessionUser: { id: "user-1", uncheckedAvatarKey: null } },
		{ imagePath: ownAvatarPath, ownerId: "user-1", sessionUser: null },
		{ imagePath: null, ownerId: "user-2", sessionUser: UNCHECKED_SESSION_USER },
	]
	for (const unmarkedAvatar of unmarkedAvatars) {
		expect(toShownAvatarImagePath({ ...unmarkedAvatar, isUnchecked: false })).toBe(unmarkedAvatar.imagePath)
	}
})

test("a team avatar its caller says is unchecked loads at its marked path", () => {
	const teamAvatarPath = toTeamAvatarImagePath("team-1", "5e6f")
	const uncheckedTeamAvatar = {
		imagePath: teamAvatarPath,
		ownerId: "team-1",
		isUnchecked: true,
		sessionUser: UNCHECKED_SESSION_USER,
	}
	expect(toShownAvatarImagePath(uncheckedTeamAvatar)).toBe("/api/team-avatars/team-1?v=5e6f&unchecked=1")
	expect(toShownAvatarImagePath({ ...uncheckedTeamAvatar, isUnchecked: false })).toBe(teamAvatarPath)
})
