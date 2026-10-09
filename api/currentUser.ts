// the single place that resolves the current user. every per-user query goes through here
import type { AnalyticsEntryPoint } from "@shared/analytics"
import { type DeviceProperties, toDeviceProperties } from "@shared/userAgent"
import type { Context } from "hono"
import type { SessionUser } from "./auth"
import type { ToolCaller } from "./mcp/toolCaller"

// the topic a route loaded, and whether it is public
export type AnalyticsTopic = { topicId: string; isPublic: boolean }

// the hono environment every route shares. Variables holds the session user the auth middleware set, or null,
// the tool caller an mcp request resolved ahead of its rate limit, and the topic a route loaded for the bot analytics
export type AppEnv = {
	Variables: { user: SessionUser | null; toolCaller?: ToolCaller; analyticsTopic?: AnalyticsTopic }
}

// a request context under that environment
export type AppContext = Context<AppEnv>

// resolves the signed-in user's id from the session set on the request context. null if unauthenticated
export function currentUser(context: AppContext): string | null {
	return context.get("user")?.id ?? null
}

// the properties every user-triggered analytics event includes
export type AnalyticsProperties = DeviceProperties & { entryPoint: AnalyticsEntryPoint; plan: string }

/**
 * The entry point, the plan, and the device an analytics event from a browser request is attributed to.
 * The plan comes from the session instead of the users table, so an event does not take an extra query.
 */
export function toAnalyticsProperties(context: AppContext): AnalyticsProperties {
	return {
		entryPoint: "web",
		plan: context.get("user")?.plan ?? "free",
		...toDeviceProperties(context.req.header("user-agent")),
	}
}
