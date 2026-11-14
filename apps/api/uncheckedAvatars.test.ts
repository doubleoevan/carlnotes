// unchecked avatar tests: an upload whose image moderation could not run is saved as unchecked beside the published
// avatar, for a user and for a team. an unchecked avatar is served to its uploader alone, and a request for an
// unchecked upload alone gets the unchecked file or not found, and never the published avatar or a redirect
import { afterEach, expect, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { stubRedisClient } from "@carlnotes/db/redisClientStub"
import { uncheckedImages } from "@carlnotes/db/schema/uncheckedImages"
import * as store from "@carlnotes/db/store"
import * as moderation from "@carlnotes/models/moderation"
import * as monitoring from "@carlnotes/server/monitoring"
import { Hono } from "hono"
import { uploadTeamAvatar } from "./avatars"
import { avatarsRoute } from "./avatarsRoute"
import {
	ONE_PIXEL_PNG,
	requestStoredAvatar,
	requestStoredAvatarFrom,
	restoreAvatarTest,
	stubSelectRow,
	TEAM_AVATAR_KEY,
	toAvatarUploadRequest,
	USER_AVATAR_KEY,
} from "./avatarTestFixtures"
import type { AppEnv } from "./currentUser"
import { toSignedInApp } from "./testSession"

// user-1's unchecked avatar and team-1's, each at a version of its own
const UNCHECKED_USER_AVATAR_KEY = "avatars/user-1/7b4c.png"
const UNCHECKED_TEAM_AVATAR_KEY = "avatars/teams/team-1/5e6f.png"

// the avatar routes as a signed-in user whose session names an unchecked upload
function toUncheckedAvatarApp(userId: string, uncheckedAvatarKey: string): Hono<AppEnv> {
	return new Hono<AppEnv>()
		.use(async (context, next) => {
			context.set("user", { id: userId, username: userId, uncheckedAvatarKey } as never)
			await next()
		})
		.route("/", avatarsRoute)
}

// stub a stored object's stream with a few bytes, and return the spy
function stubAttachmentStream(): ReturnType<typeof spyOn> {
	return spyOn(store, "attachmentStream").mockImplementation(() => new Response(ONE_PIXEL_PNG).body as ReadableStream)
}

// the pool's own query, the Redis client, and every spy, put back after each test
afterEach(restoreAvatarTest)

// an upload whose check could not run stays unchecked: the published avatar stays, and the user's row names the
// unchecked upload
test("an avatar upload whose image moderation could not run is shown to its user alone", async () => {
	const sentQueries = stubConnectionPool()
	stubRedisClient()
	spyOn(moderation, "classifyImage").mockResolvedValue({ outcome: "failed", error: new Error("timed out") })
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const uploadAttachmentSpy = spyOn(store, "uploadAttachment").mockResolvedValue(undefined)

	// the upload responds as a success in its released shape, marked unchecked
	const response = await toSignedInApp(avatarsRoute, "user-1").request("/avatars", toAvatarUploadRequest())
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ ok: true, isImageUnchecked: true })
	const uncheckedAvatarKey = uploadAttachmentSpy.mock.calls[0]?.[0]

	// the unchecked avatar is recorded, the user's row names it and keeps its published avatar, and the failure is
	// reported by its subject alone
	const uncheckedImageInsert = sentQueries.find(({ text }) => text.startsWith('insert into "unchecked_images"'))
	const userUpdate = sentQueries.find(({ text }) => text.startsWith('update "users"'))
	expect(uncheckedImageInsert?.values).toContain(uncheckedAvatarKey)
	expect(userUpdate?.text).toContain('set "unchecked_avatar_key" = $1')
	expect(userUpdate?.text).not.toContain('"avatar_key" = ')
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({ moderationSubjectKind: "avatar", moderationSubjectId: "user-1" })

	// the unchecked upload's pending row is cleared, so the upload's grace period never deletes it
	const pendingDeletes = sentQueries.filter(({ text }) => text.startsWith('delete from "pending_object_deletions"'))
	expect(pendingDeletes.map(({ values }) => values[0])).toEqual([uncheckedAvatarKey])
})

// a team's upload whose check could not run is shown to the leader who uploaded it alone, and the team's avatar stays
test("a team avatar upload whose image moderation could not run is shown to its uploader alone", async () => {
	const sentQueries = stubConnectionPool()
	spyOn(moderation, "classifyImage").mockResolvedValue({ outcome: "failed", error: new Error("timed out") })
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const uploadAttachmentSpy = spyOn(store, "uploadAttachment").mockResolvedValue(undefined)
	const teamAvatarUpload = { teamId: "team-1", userId: "user-1", bytes: ONE_PIXEL_PNG, contentType: "image/png" }
	expect(await uploadTeamAvatar({ ...teamAvatarUpload, keyId: "5e6f" })).toEqual({ isImageUnchecked: true })

	// the unchecked image's row names the team, its uploader, and the stored object, and the team's row is never written
	const uncheckedImageInsert = sentQueries.find(({ text }) => text.startsWith('insert into "unchecked_images"'))
	expect(uncheckedImageInsert?.values).toEqual(
		expect.arrayContaining(["teamAvatar", "team-1", "user-1", UNCHECKED_TEAM_AVATAR_KEY]),
	)
	expect(uploadAttachmentSpy.mock.calls[0]?.[0]).toBe(UNCHECKED_TEAM_AVATAR_KEY)
	expect(sentQueries.some(({ text }) => text.startsWith('update "teams"'))).toBe(false)

	// the unchecked upload's pending row is cleared, and the failure is reported by its subject alone
	const pendingDeletes = sentQueries.filter(({ text }) => text.startsWith('delete from "pending_object_deletions"'))
	expect(pendingDeletes.map(({ values }) => values[0])).toEqual([UNCHECKED_TEAM_AVATAR_KEY])
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({
		moderationSubjectKind: "teamAvatar",
		moderationSubjectId: "team-1",
	})
})

// the user's own session reads their unchecked upload at its version, and no cache may store it
test("an unchecked avatar is served to its own user at its version with no shared cache header", async () => {
	stubSelectRow(["generated", null, null])
	const attachmentStreamSpy = stubAttachmentStream()
	const response = await toUncheckedAvatarApp("user-1", UNCHECKED_USER_AVATAR_KEY).request("/avatars/user-1?v=7b4c")

	// the unchecked object streams with no header that lets a browser or the edge store it
	expect(response.status).toBe(200)
	expect(response.headers.get("Cache-Control")).toBe("private, no-store")
	expect(response.headers.get("CDN-Cache-Control")).toBeNull()
	expect(response.headers.get("Cache-Tag")).toBeNull()
	expect(attachmentStreamSpy).toHaveBeenCalledWith(UNCHECKED_USER_AVATAR_KEY)
})

// anyone else who asks for the unchecked version gets what the route returns for a version that is not the current one
test("an unchecked avatar's version returns the published avatar or a 404 to anyone else", async () => {
	// a visitor and another user, for a user on the initials
	stubSelectRow(["generated", null, null])
	const attachmentStreamSpy = stubAttachmentStream()
	expect((await avatarsRoute.request("/avatars/user-1?v=7b4c")).status).toBe(404)
	expect((await toSignedInApp(avatarsRoute, "user-2").request("/avatars/user-1?v=7b4c")).status).toBe(404)

	// another user whose own session names an unchecked upload still reads user-1's published avatar
	restoreConnectionPool()
	stubSelectRow(["upload", USER_AVATAR_KEY, null])
	const otherUncheckedUserApp = toUncheckedAvatarApp("user-2", "avatars/user-2/7b4c.png")
	const publishedResponse = await otherUncheckedUserApp.request("/avatars/user-1?v=7b4c", {
		headers: { "if-none-match": `"${USER_AVATAR_KEY}"` },
	})
	expect(publishedResponse.status).toBe(304)
	expect(publishedResponse.headers.get("Cache-Control")).toBe("public, max-age=60")
	expect(attachmentStreamSpy).not.toHaveBeenCalled()
})

// the leader who uploaded an unchecked team avatar reads it at its version, and every other request gets the published
// one
test("an unchecked team avatar is served to its uploader alone", async () => {
	// the team's published avatar, and the unchecked avatar that user-1 uploaded
	const uncheckedTeamAvatarRow = toTableRow(uncheckedImages, {
		subjectKind: "teamAvatar",
		subjectId: "team-1",
		uploaderUserId: "user-1",
		avatarKey: UNCHECKED_TEAM_AVATAR_KEY,
	})
	const sentQueries = stubConnectionPool(({ text, values }) => {
		if (text.includes('from "unchecked_images"')) {
			return values.includes("user-1") ? [uncheckedTeamAvatarRow] : []
		}
		return [[TEAM_AVATAR_KEY]]
	})
	const attachmentStreamSpy = stubAttachmentStream()

	// the uploader, at the unchecked version
	const uploaderResponse = await toSignedInApp(avatarsRoute, "user-1").request("/team-avatars/team-1?v=5e6f")
	expect(uploaderResponse.status).toBe(200)
	expect(uploaderResponse.headers.get("Cache-Control")).toBe("private, no-store")
	expect(attachmentStreamSpy).toHaveBeenCalledWith(UNCHECKED_TEAM_AVATAR_KEY)

	// another member and a visitor, at the unchecked version, get the published avatar at a version that is not current
	for (const app of [toSignedInApp(avatarsRoute, "user-2"), avatarsRoute]) {
		const publishedResponse = await requestStoredAvatarFrom(app, "/team-avatars/team-1?v=5e6f", TEAM_AVATAR_KEY)
		expect(publishedResponse.status).toBe(304)
		expect(publishedResponse.headers.get("Cache-Control")).toBe("public, max-age=60")
	}

	// a request for the current version, and a visitor's request, never read the unchecked avatars
	sentQueries.length = 0
	await requestStoredAvatarFrom(toSignedInApp(avatarsRoute, "user-1"), "/team-avatars/team-1?v=9c1b", TEAM_AVATAR_KEY)
	await requestStoredAvatar("/team-avatars/team-1?v=5e6f", TEAM_AVATAR_KEY)
	expect(sentQueries.some(({ text }) => text.includes('from "unchecked_images"'))).toBe(false)
})

// the mobile app asks for an unchecked upload alone, and gets the unchecked file or nothing
test("a request for an unchecked avatar alone is served to its own user and is not found for anyone else", async () => {
	// user-1 has a published upload, which a request for the unchecked upload alone never gets
	stubSelectRow(["upload", USER_AVATAR_KEY, null])
	const attachmentStreamSpy = stubAttachmentStream()
	const uncheckedAvatarPath = "/avatars/user-1?v=7b4c&unchecked=1"

	// the uploader's own session gets the unchecked file with no header that lets a cache store it
	const uploaderResponse = await toUncheckedAvatarApp("user-1", UNCHECKED_USER_AVATAR_KEY).request(uncheckedAvatarPath)
	expect(uploaderResponse.status).toBe(200)
	expect(uploaderResponse.headers.get("Cache-Control")).toBe("private, no-store")
	expect(uploaderResponse.headers.get("CDN-Cache-Control")).toBeNull()
	expect(uploaderResponse.headers.get("Cache-Tag")).toBeNull()
	expect(attachmentStreamSpy).toHaveBeenCalledWith(UNCHECKED_USER_AVATAR_KEY)

	// a visitor, another user, and another user with an unchecked upload of their own are not found
	attachmentStreamSpy.mockClear()
	const otherApps = [
		avatarsRoute,
		toSignedInApp(avatarsRoute, "user-2"),
		toUncheckedAvatarApp("user-2", "avatars/user-2/7b4c.png"),
	]
	for (const otherApp of otherApps) {
		const otherResponse = await requestStoredAvatarFrom(otherApp, uncheckedAvatarPath, USER_AVATAR_KEY)
		expect(otherResponse.status).toBe(404)
		expect(otherResponse.headers.get("Cache-Control")).toBe("private, no-store")
		expect(otherResponse.headers.get("ETag")).toBeNull()
	}
	expect(attachmentStreamSpy).not.toHaveBeenCalled()

	// the uploader's request at a version that neither the unchecked upload nor the published avatar has is not found too
	const otherVersionResponse = await toUncheckedAvatarApp("user-1", UNCHECKED_USER_AVATAR_KEY).request(
		"/avatars/user-1?v=0d9e&unchecked=1",
	)
	expect(otherVersionResponse.status).toBe(404)
})

// a session that still names an unchecked avatar after its upload was published asks for the upload alone, and loads it
test("an unchecked avatar that was published is served at its marked url, at its own version alone", async () => {
	// user-1's and team-1's unchecked uploads are their published avatars now, and no unchecked image's row is left
	stubConnectionPool(({ text }) => {
		if (text.includes('from "unchecked_images"')) {
			return []
		}
		return text.includes('from "teams"') ? [[UNCHECKED_TEAM_AVATAR_KEY]] : [["upload", UNCHECKED_USER_AVATAR_KEY, null]]
	})
	const publishedApp = toSignedInApp(avatarsRoute, "user-1")

	// the marked url at the published version gets the published avatar, with the headers of any current version
	const publishedAvatars = [
		{ avatarPath: "/avatars/user-1?v=7b4c&unchecked=1", avatarKey: UNCHECKED_USER_AVATAR_KEY },
		{ avatarPath: "/team-avatars/team-1?v=5e6f&unchecked=1", avatarKey: UNCHECKED_TEAM_AVATAR_KEY },
	]
	for (const { avatarPath, avatarKey } of publishedAvatars) {
		const publishedResponse = await requestStoredAvatarFrom(publishedApp, avatarPath, avatarKey)
		expect(publishedResponse.status).toBe(304)
		expect(publishedResponse.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable")
	}

	// a marked url at the version it replaced is not found, and never gets the published avatar
	for (const replacedAvatarPath of ["/avatars/user-1?v=3f2a&unchecked=1", "/team-avatars/team-1?v=9c1b&unchecked=1"]) {
		const replacedResponse = await publishedApp.request(replacedAvatarPath)
		expect(replacedResponse.status).toBe(404)
		expect(replacedResponse.headers.get("Cache-Control")).toBe("private, no-store")
	}
})

// a request that may bring the session cookie is never sent on to a provider's host
test("a request for an unchecked avatar alone never redirects to a provider photo", async () => {
	// a user on a provider photo with no unchecked avatar, as a visitor and as that user ask
	stubSelectRow(["oauth", null, "https://lh3.googleusercontent.com/a/photo"])
	const requestApps = [avatarsRoute, toSignedInApp(avatarsRoute, "user-1")]

	// at the photo's own version and with no version, neither request is redirected
	for (const uncheckedAvatarPath of ["/avatars/user-1?v=oauth&unchecked=1", "/avatars/user-1?unchecked=1"]) {
		for (const requestApp of requestApps) {
			// not found, with no address to follow and no header that lets a cache store the response
			const response = await requestApp.request(uncheckedAvatarPath)
			expect(response.status).toBe(404)
			expect(response.headers.get("Location")).toBeNull()
			expect(response.headers.get("Cache-Control")).toBe("private, no-store")
		}
	}
})

// a leader's unchecked team avatar follows the same rule
test("a request for an unchecked team avatar alone is served to its uploader and is not found for anyone else", async () => {
	// the team's published avatar, and the unchecked avatar that user-1 uploaded
	const uncheckedTeamAvatarRow = toTableRow(uncheckedImages, {
		subjectKind: "teamAvatar",
		subjectId: "team-1",
		uploaderUserId: "user-1",
		avatarKey: UNCHECKED_TEAM_AVATAR_KEY,
	})

	// the pool returns the unchecked avatar to user-1's read alone, and the team's published key to every other read
	stubConnectionPool(({ text, values }) => {
		if (text.includes('from "unchecked_images"')) {
			return values.includes("user-1") ? [uncheckedTeamAvatarRow] : []
		}
		return [[TEAM_AVATAR_KEY]]
	})
	const attachmentStreamSpy = stubAttachmentStream()
	const uncheckedTeamAvatarPath = "/team-avatars/team-1?v=5e6f&unchecked=1"

	// the uploader gets the unchecked file with no header that lets a cache store it
	const uploaderResponse = await toSignedInApp(avatarsRoute, "user-1").request(uncheckedTeamAvatarPath)
	expect(uploaderResponse.status).toBe(200)
	expect(uploaderResponse.headers.get("Cache-Control")).toBe("private, no-store")
	expect(attachmentStreamSpy).toHaveBeenCalledWith(UNCHECKED_TEAM_AVATAR_KEY)

	// another member and a visitor are not found, and never get the published avatar
	for (const otherApp of [toSignedInApp(avatarsRoute, "user-2"), avatarsRoute]) {
		const otherResponse = await requestStoredAvatarFrom(otherApp, uncheckedTeamAvatarPath, TEAM_AVATAR_KEY)
		expect(otherResponse.status).toBe(404)
		expect(otherResponse.headers.get("Cache-Control")).toBe("private, no-store")
	}

	// the uploader's request at a version that neither the unchecked upload nor the team's avatar has is not found too
	const otherVersionResponse = await requestStoredAvatarFrom(
		toSignedInApp(avatarsRoute, "user-1"),
		"/team-avatars/team-1?v=0d9e&unchecked=1",
		TEAM_AVATAR_KEY,
	)
	expect(otherVersionResponse.status).toBe(404)
})
