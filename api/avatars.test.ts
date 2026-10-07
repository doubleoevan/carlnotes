// avatar route tests: an upload is cached long only at its current version.
// a provider photo's redirect is cached for an hour
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "../db/connectionPoolStub"
import { avatarsRoute } from "./avatars"

// a user's upload and a team's upload. the id in each file name is its version
const USER_AVATAR_KEY = "avatars/user-1/3f2a.png"
const TEAM_AVATAR_KEY = "avatars/teams/team-1/9c1b.webp"

// the pool's own query, put back after each test
afterEach(restoreConnectionPool)

// return one row for every select, with its columns in the order that the route selects them
function stubSelectRow(row: unknown[]): void {
	stubConnectionPool(() => [row])
}

// a conditional request, so a stored image responds with its headers alone and never reads storage
async function requestStoredAvatar(avatarPath: string, avatarKey: string): Promise<Response> {
	return avatarsRoute.request(avatarPath, { headers: { "if-none-match": `"${avatarKey}"` } })
}

// the current version's bytes never change, so the browser caches them for a year and the edge for a day
test("a user's upload at its current version is immutable", async () => {
	stubSelectRow(["upload", USER_AVATAR_KEY, null])
	const response = await requestStoredAvatar("/avatars/user-1?v=3f2a", USER_AVATAR_KEY)
	expect(response.status).toBe(304)
	expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable")
	expect(response.headers.get("CDN-Cache-Control")).toBe("max-age=86400")
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

// a team's avatar follows the same rule as a user's upload
test("a team's upload is immutable only at its current version", async () => {
	stubSelectRow([TEAM_AVATAR_KEY])
	const currentResponse = await requestStoredAvatar("/team-avatars/team-1?v=9c1b", TEAM_AVATAR_KEY)
	const oldResponse = await requestStoredAvatar("/team-avatars/team-1?v=3f2a", TEAM_AVATAR_KEY)
	expect(currentResponse.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable")
	expect(oldResponse.headers.get("Cache-Control")).toBe("public, max-age=60")
})
