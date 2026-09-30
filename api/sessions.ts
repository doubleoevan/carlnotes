// the app's own writes to the sessions that Better Auth caches in Redis.
// a session is stored under its token as { session, user }, and active-sessions-<userId> lists a user's tokens
import { eq } from "drizzle-orm"
import { db } from "../db"
import { readRedisJson, replaceRedisJson, runWithRedis, saveRedisJson } from "../db/redis"
import { sessions, users } from "../db/schema"

// one entry of a user's active-sessions list, in the shape that Better Auth writes
type ActiveSession = { token: string; expiresAt: number }

// a session's Redis entry holds the session row and the users row from when the entry was written
type StoredSession = { session: { expiresAt: string | Date }; user: unknown }

// the session row that Better Auth's session update hook passes
type RefreshedSession = { token: string; userId: string; expiresAt: Date }

// how a users row is read. a test passes a fake
type LoadUserRow = (userId: string) => Promise<unknown>

/**
 * Rewrites each of the user's Redis sessions with a fresh read of the users row.
 * The next request reads a changed plan, role, username, avatar, or invite access without a new sign-in.
 */
export async function refreshSessionUser(userId: string, loadUser: LoadUserRow = loadUserRow): Promise<void> {
	// read the fresh users row. a closed account has none
	const userRow = await loadUser(userId)
	if (!userRow) {
		return
	}

	// every session token that the user holds
	const sessionTokens = await loadSessionTokens(userId)

	// rewrite each stored session with the fresh row and keep the session's expiry.
	// a session deleted since the read stays deleted
	for (const sessionToken of sessionTokens) {
		const storedSession = await readRedisJson<StoredSession>(sessionToken)
		const ttlMs = storedSession ? new Date(storedSession.session.expiresAt).getTime() - Date.now() : 0
		if (storedSession && ttlMs > 0) {
			await replaceRedisJson({ key: sessionToken, value: { ...storedSession, user: userRow }, ttlMs })
		}
	}
}

/**
 * Deletes the user's Redis sessions and active-sessions list. Returns false if Redis is unreachable.
 * The session tokens come from Postgres, which keeps every session. A token that the list missed is deleted too.
 */
export async function revokeUserSessions(userId: string): Promise<boolean> {
	// every session token that the user holds, and the active-sessions list
	const sessionTokens = await loadSessionTokens(userId)
	const redisKeys = [...sessionTokens, toActiveSessionsKey(userId)]

	// delete the tokens and the list in one command. null means Redis is unreachable
	const deletedKeyCount = await runWithRedis("revokeUserSessions", (client) => client.del(...redisKeys))
	return deletedKeyCount !== null
}

/**
 * Stores a refreshed session in Redis until the session expires, if Redis holds no copy.
 * The session's token is added to the user's active-sessions list.
 */
export async function cacheSession(session: RefreshedSession, loadUser: LoadUserRow = loadUserRow): Promise<void> {
	// skip a session that is expired or already stored
	const ttlMs = session.expiresAt.getTime() - Date.now()
	if (ttlMs <= 0 || (await readRedisJson(session.token)) !== null) {
		return
	}

	// store the session with the fresh users row. a closed account has none
	const userRow = await loadUser(session.userId)
	if (!userRow) {
		return
	}
	await saveRedisJson({ key: session.token, value: { session, user: userRow }, ttlMs })

	// read the active-sessions list, add the token, and drop expired entries.
	// the list expires with the session that expires last
	const now = Date.now()
	const storedActiveSessions = (await readRedisJson<ActiveSession[]>(toActiveSessionsKey(session.userId))) ?? []
	const otherActiveSessions = storedActiveSessions.filter(
		(activeSession) => activeSession.expiresAt > now && activeSession.token !== session.token,
	)
	const activeSessions = [...otherActiveSessions, { token: session.token, expiresAt: session.expiresAt.getTime() }]
	const activeSessionsTtlMs = Math.max(...activeSessions.map((activeSession) => activeSession.expiresAt)) - now
	await saveRedisJson({ key: toActiveSessionsKey(session.userId), value: activeSessions, ttlMs: activeSessionsTtlMs })
}

// the users row that a session entry stores, or undefined for a closed account
async function loadUserRow(userId: string): Promise<unknown> {
	const [userRow] = await db.select().from(users).where(eq(users.id, userId))
	return userRow
}

// every session token that the user holds, read from Postgres, which keeps every session
async function loadSessionTokens(userId: string): Promise<string[]> {
	const sessionRows = await db.select({ token: sessions.token }).from(sessions).where(eq(sessions.userId, userId))
	return sessionRows.map((sessionRow) => sessionRow.token)
}

// the key of a user's active-sessions list
function toActiveSessionsKey(userId: string): string {
	return `active-sessions-${userId}`
}
