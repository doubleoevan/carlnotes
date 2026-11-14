// avatar route tests: an upload is cached long only at its current version, and a provider photo's redirect is cached
// for an hour. a decode failure is reported, an upload records its key first, an image the moderation flags or cannot
// read is rejected before anything stores, and a clean upload or one with no moderation key is published at once
import { afterEach, expect, spyOn, test } from "bun:test"
import { stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as store from "@carlnotes/db/store"
import * as moderation from "@carlnotes/models/moderation"
import * as avatarImages from "@carlnotes/pipeline/avatarImages"
import { toBombPng } from "@carlnotes/pipeline/topicPosts/topicPostBodyImageTestFixtures"
import * as monitoring from "@carlnotes/server/monitoring"
import { uploadTeamAvatar } from "./avatars"
import { avatarsRoute } from "./avatarsRoute"
import {
	ONE_PIXEL_PNG,
	requestStoredAvatar,
	restoreAvatarTest,
	stubSelectRow,
	TEAM_AVATAR_KEY,
	toAvatarUploadRequest,
	USER_AVATAR_KEY,
} from "./avatarTestFixtures"
import { toJsonRequest, toSignedInApp } from "./testSession"

// the pool's own query, the Redis client, and every spy, put back after each test
afterEach(restoreAvatarTest)

// the current version's bytes never change, so the browser caches them for a year and the edge for a day,
// under the user's tag so a deletion can purge it
test("a user's upload at its current version is immutable and tagged", async () => {
	stubSelectRow(["upload", USER_AVATAR_KEY, null])
	const response = await requestStoredAvatar("/avatars/user-1?v=3f2a", USER_AVATAR_KEY)
	expect(response.status).toBe(304)
	expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable")
	expect(response.headers.get("CDN-Cache-Control")).toBe("max-age=86400")
	expect(response.headers.get("Cache-Tag")).toBe("user-avatar:user-1")
})

// a page from before an upload still shows an avatar and picks up the new one within a minute
test("a user's upload at an old version or with none is cached for a minute", async () => {
	stubSelectRow(["upload", USER_AVATAR_KEY, null])
	for (const avatarPath of ["/avatars/user-1?v=0d9e", "/avatars/user-1"]) {
		const response = await requestStoredAvatar(avatarPath, USER_AVATAR_KEY)
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=60")
		expect(response.headers.get("CDN-Cache-Control")).toBeNull()
	}
})

// the photo lives at its provider and can change there, so the redirect is cached for an hour. the user's tag lets
// an avatar reset purge the redirect from the edge
test("a provider photo redirects, and the redirect is cached for an hour under the user's tag", async () => {
	stubSelectRow(["oauth", null, "https://lh3.googleusercontent.com/a/photo"])
	const response = await avatarsRoute.request("/avatars/user-1?v=oauth")
	expect(response.status).toBe(302)
	expect(response.headers.get("Location")).toBe("https://lh3.googleusercontent.com/a/photo")
	expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600")
	expect(response.headers.get("Cache-Tag")).toBe("user-avatar:user-1")
})

// a team's avatar follows the same rule as a user's upload, under the team's tag at every version
test("a team's upload is immutable only at its current version and tagged at every version", async () => {
	// the current version and an old one
	stubSelectRow([TEAM_AVATAR_KEY])
	const currentResponse = await requestStoredAvatar("/team-avatars/team-1?v=9c1b", TEAM_AVATAR_KEY)
	const oldResponse = await requestStoredAvatar("/team-avatars/team-1?v=3f2a", TEAM_AVATAR_KEY)

	// the cache headers differ by version, and the tag is the same
	expect(currentResponse.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable")
	expect(oldResponse.headers.get("Cache-Control")).toBe("public, max-age=60")
	expect(currentResponse.headers.get("Cache-Tag")).toBe("team-avatar:team-1")
	expect(oldResponse.headers.get("Cache-Tag")).toBe("team-avatar:team-1")
})

// a decode failure from the browser is reported with the file's type and size, and only for a signed-in user
test("a decode failure is reported by its type and size for a signed-in user alone, five a day", async () => {
	// the report spied, the day's count in Redis, and the route as a signed-in user and as a visitor
	stubRedisClient()
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const signedInApp = toSignedInApp(avatarsRoute, "user-1")

	// one report of a HEIC file
	const decodeFailureRequest = toJsonRequest({ contentType: "image/heic", byteSize: 3_000_000 })

	// the signed-in report is taken and reported, and the visitor's is rejected
	const signedInResponse = await signedInApp.request("/avatars/decode-failures", decodeFailureRequest)
	const visitorResponse = await avatarsRoute.request("/avatars/decode-failures", decodeFailureRequest)
	expect(signedInResponse.status).toBe(204)
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({ contentType: "image/heic", byteSize: "3000000" })
	expect(visitorResponse.status).toBe(401)

	// the user's reports past five in a day are taken and dropped
	for (let i = 0; i < 6; i++) {
		expect((await signedInApp.request("/avatars/decode-failures", decodeFailureRequest)).status).toBe(204)
	}
	expect(reportErrorSpy).toHaveBeenCalledTimes(5)
})

// an upload records its key as pending before the object is written, and the row write's transaction clears it
test("a team upload records its key before the upload and clears it with the row", async () => {
	// a team with no avatar yet, with every query recorded and the upload spied
	const sentQueries = stubConnectionPool(({ text }) => (text.includes("for update") ? [[null]] : []))
	const uploadAttachmentSpy = spyOn(store, "uploadAttachment").mockResolvedValue(undefined)
	const teamAvatarUpload = { teamId: "team-1", userId: "user-1", bytes: ONE_PIXEL_PNG, contentType: "image/png" }
	expect(await uploadTeamAvatar({ ...teamAvatarUpload, keyId: "9c1b" })).toEqual({ isImageUnchecked: false })

	// the pending insert comes first, the upload next, and the clear follows the team update
	const pendingInsertIndex = sentQueries.findIndex(({ text }) =>
		text.startsWith('insert into "pending_object_deletions"'),
	)
	const teamUpdateIndex = sentQueries.findIndex(({ text }) => text.startsWith('update "teams"'))
	const pendingDeleteIndex = sentQueries.findIndex(({ text }) =>
		text.startsWith('delete from "pending_object_deletions"'),
	)
	expect(pendingInsertIndex).toBe(0)
	expect(sentQueries[pendingInsertIndex]?.values[0]).toBe(TEAM_AVATAR_KEY)
	expect(uploadAttachmentSpy.mock.calls[0]?.[0]).toBe(TEAM_AVATAR_KEY)
	expect(pendingDeleteIndex).toBeGreaterThan(teamUpdateIndex)
	expect(sentQueries[pendingDeleteIndex]?.values).toEqual([TEAM_AVATAR_KEY])
})

// an avatar the moderation flags gets Carl's 422 naming its category, and nothing is written to storage
test("a flagged avatar upload is rejected with its category and stores nothing", async () => {
	stubConnectionPool()
	stubRedisClient()
	spyOn(moderation, "classifyImage").mockResolvedValue({
		outcome: "classified",
		verdict: { isViolation: true, category: "sexual" },
	})
	const uploadAttachmentSpy = spyOn(store, "uploadAttachment").mockResolvedValue(undefined)

	// the upload, as the browser's resized png
	const response = await toSignedInApp(avatarsRoute, "user-1").request("/avatars", toAvatarUploadRequest())
	expect(response.status).toBe(422)
	expect(await response.json()).toEqual({ rejection: "objectionable", category: "sexual" })
	expect(uploadAttachmentSpy).not.toHaveBeenCalled()
})

// an avatar the moderation cannot read is rejected as an unsupported type instead of passing unchecked
test("an unreadable avatar upload is rejected as an unsupported type", async () => {
	stubConnectionPool()
	stubRedisClient()
	spyOn(moderation, "classifyImage").mockResolvedValue({ outcome: "unreadable" })
	const uploadAttachmentSpy = spyOn(store, "uploadAttachment").mockResolvedValue(undefined)

	// the upload
	const response = await toSignedInApp(avatarsRoute, "user-1").request("/avatars", toAvatarUploadRequest())
	expect(response.status).toBe(400)
	expect(await response.json()).toEqual({ error: "unsupported-type" })
	expect(uploadAttachmentSpy).not.toHaveBeenCalled()
})

// bytes that are not an image, and an image that declares too many pixels, are rejected before the moderation is asked
test("an avatar the server cannot decode or that is too large in pixels is rejected and stores nothing", async () => {
	stubConnectionPool()
	const classifyImageSpy = spyOn(moderation, "classifyImage")
	const uploadAttachmentSpy = spyOn(store, "uploadAttachment").mockResolvedValue(undefined)
	const signedInApp = toSignedInApp(avatarsRoute, "user-1")

	// bytes that claim to be a png and are not one
	const undecodableForm = new FormData()
	undecodableForm.append("avatar", new File([new Uint8Array([137, 80, 78, 71])], "avatar.png", { type: "image/png" }))
	const undecodableResponse = await signedInApp.request("/avatars", { method: "POST", body: undecodableForm })
	expect(undecodableResponse.status).toBe(400)
	expect(await undecodableResponse.json()).toEqual({ error: "unsupported-type" })

	// an image past the pixel limit
	spyOn(avatarImages, "toStoredAvatar").mockResolvedValue("too-large")
	const tooLargeResponse = await signedInApp.request("/avatars", toAvatarUploadRequest())
	expect(tooLargeResponse.status).toBe(400)
	expect(await tooLargeResponse.json()).toEqual({ error: "too-large" })
	expect(classifyImageSpy).not.toHaveBeenCalled()
	expect(uploadAttachmentSpy).not.toHaveBeenCalled()
})

// a clean upload is stored as the server's own re-encode and becomes the user's avatar
test("a clean avatar upload stores the server's re-encode and points the user at it", async () => {
	const sentQueries = stubConnectionPool(({ text }) => (text.includes("for update") ? [[null, null]] : []))
	stubRedisClient()
	spyOn(moderation, "classifyImage").mockResolvedValue({
		outcome: "classified",
		verdict: { isViolation: false, category: null },
	})
	const uploadAttachmentSpy = spyOn(store, "uploadAttachment").mockResolvedValue(undefined)

	// the upload responds in its released shape, not marked unchecked
	const response = await toSignedInApp(avatarsRoute, "user-1").request("/avatars", toAvatarUploadRequest())
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ ok: true })

	// the stored bytes are a png the server encoded, and the user's row points at them with no unchecked upload
	expect(uploadAttachmentSpy.mock.calls[0]?.[2]).toBe("image/png")
	const userUpdate = sentQueries.find(({ text }) => text.startsWith('update "users"'))
	expect(userUpdate?.text).toContain('"avatar_source" = $1, "avatar_key" = $2, "unchecked_avatar_key" = $3')
	expect(userUpdate?.values.slice(0, 3)).toEqual(["upload", uploadAttachmentSpy.mock.calls[0]?.[0], null])
})

// a small file that declares a huge image is rejected from its header, before the moderation is asked
test("a team avatar past the pixel limit is rejected and stores nothing", async () => {
	const sentQueries = stubConnectionPool()
	const classifyImageSpy = spyOn(moderation, "classifyImage")
	const uploadAttachmentSpy = spyOn(store, "uploadAttachment").mockResolvedValue(undefined)
	const hugeAvatarUpload = { teamId: "team-1", userId: "user-1", bytes: toBombPng(12_000), contentType: "image/png" }
	expect(await uploadTeamAvatar({ ...hugeAvatarUpload, keyId: "9c1b" })).toEqual({ rejection: "too-large" })

	// nothing is classified, stored, or written, so the team's avatar is unchanged
	expect(classifyImageSpy).not.toHaveBeenCalled()
	expect(uploadAttachmentSpy).not.toHaveBeenCalled()
	expect(sentQueries).toEqual([])
})

// with no moderation key the check is skipped, and the upload shows to everyone at once
test("an avatar upload with no moderation key set is stored and nothing is saved as unchecked", async () => {
	const sentQueries = stubConnectionPool(({ text }) => (text.includes("for update") ? [[null, null]] : []))
	stubRedisClient()
	spyOn(moderation, "classifyImage").mockResolvedValue({ outcome: "skipped" })
	spyOn(store, "uploadAttachment").mockResolvedValue(undefined)

	// the upload responds not marked unchecked, and no unchecked avatar is recorded
	const response = await toSignedInApp(avatarsRoute, "user-1").request("/avatars", toAvatarUploadRequest())
	expect(await response.json()).toEqual({ ok: true })
	expect(sentQueries.some(({ text }) => text.startsWith('insert into "unchecked_images"'))).toBe(false)
})
