// the single place that resolves the current user. every per-user query goes through here
import type { Context } from "hono"
import type { SessionUser } from "./auth"

// the hono environment every route shares. Variables holds the session user the auth middleware set, or null
export type AppEnv = { Variables: { user: SessionUser | null } }

// a request context under that environment
export type AppContext = Context<AppEnv>

// resolves the signed-in user's id from the session set on the request context. null when unauthenticated
export function currentUser(context: AppContext): string | null {
	return context.get("user")?.id ?? null
}
