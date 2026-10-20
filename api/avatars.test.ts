// avatar route tests: an upload is cached long only at its current version, and an upload records its key first.
// a provider photo's redirect is cached for an hour
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { restoreConnectionPool, stubConnectionPool } from "../db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "../db/redisClientStub"
import * as store from "../worker/store"
import { uploadTeamAvatar } from "./avatars"
import { avatarsRoute } from "./avatarsRoute"
import { toJsonRequest, toSignedInApp } from "./testSession"

// a user's upload and a team's upload. the id in each file name is its version
const USER_AVATAR_KEY = "avatars/user-1/3f2a.png"
const TEAM_AVATAR_KEY = "avatars/teams/team-1/9c1b.webp"

// the pool's own query, the Redis client, and every spy, put back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
})

// return one row for every select, with its columns in the order that the route selects them
function stubSelectRow(row: unknown[]): void {
	stubConnectionPool(() => [row])
}

// a conditional request, so a stored image responds with its headers alone and never reads storage
async function requestStoredAvatar(avatarPath: string, avatarKey: string): Promise<Response> {
	return avatarsRoute.request(avatarPath, { headers: { "if-none-match": `"${avatarKey}"` } })
}

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

// the photo lives at its provider and can change there, so the redirect is cached for an hour
test("a provider photo redirects, and the redirect is cached for an hour", async () => {
	stubSelectRow(["oauth", null, "https://lh3.googleusercontent.com/a/photo"])
	const response = await avatarsRoute.request("/avatars/user-1?v=oauth")
	expect(response.status).toBe(302)
	expect(response.headers.get("Location")).toBe("https://lh3.googleusercontent.com/a/photo")
	expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600")
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
	expect(await uploadTeamAvatar("team-1", new Uint8Array([1]), "image/webp", "9c1b")).toBeNull()

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
