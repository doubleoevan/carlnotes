// the session helpers the api tests share: a session cookie, the session lookup resolved as one user or as a visitor,
// a route with one user signed in, and a json post. only tests import it
import { spyOn } from "bun:test"
import { Hono } from "hono"
import { auth } from "./auth"
import type { AppEnv } from "./currentUser"

// a request's session cookie, which marks the request signed in wherever a check reads the cookie without a lookup
export const SESSION_COOKIE = "better-auth.session_token=abc"

/**
 * Resolves every session lookup as the given user, or as a visitor for null, until the spies are restored.
 */
export function signInAs(userId: string | null): void {
	spyOn(auth.api, "getSession").mockResolvedValue(
		userId ? ({ user: { id: userId }, session: { id: `session-${userId}` } } as never) : null,
	)
}

/**
 * Returns an app that serves the route with the given user signed in on every request, named after their id.
 */
export function toSignedInApp(route: Hono<AppEnv>, userId: string): Hono<AppEnv> {
	return new Hono<AppEnv>()
		.use(async (context, next) => {
			context.set("user", { id: userId, username: userId } as never)
			await next()
		})
		.route("/", route)
}

/**
 * Returns a json post of the given body.
 */
export function toJsonRequest(body: unknown): RequestInit {
	return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
}
