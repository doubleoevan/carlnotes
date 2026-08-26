// the single place that resolves the current user. every per-user query goes through here
import { type BrowserPlatform, isInAppBrowser, toBrowserPlatform, toPlatform } from "@shared/userAgent"
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

// the properties every user-triggered analytics event includes
export type AnalyticsProperties = {
	plan: string
	platform: "mobile" | "desktop"
	browserPlatform: BrowserPlatform
	isInAppBrowser: boolean
}

/**
 * The plan and device an analytics event is attributed to.
 * The plan comes from the session instead of the users table, so an event does not take an extra query.
 */
export function toAnalyticsProperties(context: AppContext): AnalyticsProperties {
	// one user agent gives all three device properties, so it is read once
	const userAgent = context.req.header("user-agent")
	return {
		plan: context.get("user")?.plan ?? "free",
		platform: toPlatform(userAgent),
		browserPlatform: toBrowserPlatform(userAgent ?? ""),
		isInAppBrowser: isInAppBrowser(userAgent ?? ""),
	}
}
