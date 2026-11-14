// what the avatar tests share: the restore each test file runs after a test, the avatar keys, the one pixel png and
// its upload request, the stubbed select row, and the conditional requests for a stored avatar
import { mock } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient } from "@carlnotes/db/redisClientStub"
import type { Hono } from "hono"
import { avatarsRoute } from "./avatarsRoute"
import type { AppEnv } from "./currentUser"

// put the connection pool, the Redis client, and every spy back
export function restoreAvatarTest(): void {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
}

// a user's upload and a team's upload. the id in each file name is its version
export const USER_AVATAR_KEY = "avatars/user-1/3f2a.png"
export const TEAM_AVATAR_KEY = "avatars/teams/team-1/9c1b.png"

// a real one pixel png, which the server can decode and re-encode
export const ONE_PIXEL_PNG = Uint8Array.from(
	atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
	(character) => character.charCodeAt(0),
)

// an avatar upload of the one pixel png as the browser sends it
export function toAvatarUploadRequest(): RequestInit {
	const formData = new FormData()
	formData.append("avatar", new File([ONE_PIXEL_PNG], "avatar.png", { type: "image/png" }))
	return { method: "POST", body: formData }
}

// return one row for every select, with its columns in the order that the route selects them
export function stubSelectRow(row: unknown[]): void {
	stubConnectionPool(() => [row])
}

// a conditional request, so a stored image responds with its headers alone and never reads storage
export async function requestStoredAvatar(avatarPath: string, avatarKey: string): Promise<Response> {
	return requestStoredAvatarFrom(avatarsRoute, avatarPath, avatarKey)
}

// the same conditional request through an app that signs a user in
export async function requestStoredAvatarFrom(
	app: Hono<AppEnv>,
	avatarPath: string,
	avatarKey: string,
): Promise<Response> {
	return app.request(avatarPath, { headers: { "if-none-match": `"${avatarKey}"` } })
}
