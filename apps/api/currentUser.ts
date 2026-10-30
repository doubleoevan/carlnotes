// the single place that resolves the current user. every per-user query goes through here
import type { AnalyticsEntryPoint } from "@carlnotes/contracts/analyticsEvents"
import { type ClientTelemetry, toClientTelemetry } from "@carlnotes/contracts/clientTelemetry"
import type { Context } from "hono"
import type { SessionUser } from "./auth"
import type { ToolCaller } from "./mcp/toolCaller"

// the topic a route loaded, and whether it is public
export type AnalyticsTopic = { topicId: string; isPublic: boolean }

// the hono environment every route shares. Variables holds the session user the auth middleware set, or null, the
// session's own id, the tool caller an mcp request resolved ahead of its rate limit, and the topic a route loaded for
// the bot analytics
export type AppEnv = {
	Variables: {
		user: SessionUser | null
		sessionId?: string | null
		toolCaller?: ToolCaller
		analyticsTopic?: AnalyticsTopic
	}
}

// a request context under that environment
export type AppContext = Context<AppEnv>

// resolves the signed-in user's id from the session set on the request context. null if unauthenticated
export function currentUser(context: AppContext): string | null {
	return context.get("user")?.id ?? null
}

// resolves the id of the request's session. null if unauthenticated
export function currentSessionId(context: AppContext): string | null {
	return context.get("sessionId") ?? null
}

// the properties every user-triggered analytics event includes
export type AnalyticsProperties = Omit<ClientTelemetry, "entryPoint"> & {
	entryPoint: AnalyticsEntryPoint
	plan: string
}

/**
 * Returns the request's entry point, account plan, and descriptive client telemetry.
 */
export function toAnalyticsProperties(context: AppContext): AnalyticsProperties {
	return {
		plan: context.get("user")?.plan ?? "free",
		...toClientTelemetry((name) => context.req.header(name)),
	}
}
