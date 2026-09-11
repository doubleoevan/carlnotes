// who is calling the mcp server: a visitor, or the user a bearer token resolves to
import { toBrowserPlatform, toPlatform } from "@shared/userAgent"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { users } from "../../db/schema"
import { auth } from "../auth"
import type { AnalyticsProperties } from "../currentUser"

// who is calling, resolved once to a visitor or a user
export type ToolCaller = { kind: "visitor" } | { kind: "user"; userId: string; plan: string; litellmApiKey?: string }

// resolve the tool caller. an accepted bearer token means a user, anything else is a visitor
export async function resolveToolCaller(headers: Headers): Promise<ToolCaller> {
	if (!headers.get("authorization")) {
		return { kind: "visitor" }
	}

	// look the session up. a token the auth plugin rejects means a visitor
	const mcpSession = await auth.api.getMcpSession({ headers })
	if (!mcpSession?.userId) {
		return { kind: "visitor" }
	}

	// read the user's plan and litellm key
	const [user] = await db
		.select({ plan: users.plan, litellmVirtualKey: users.litellmVirtualKey })
		.from(users)
		.where(eq(users.id, mcpSession.userId))
	// treat a token whose user is gone as a visitor
	if (!user) {
		return { kind: "visitor" }
	}
	return {
		kind: "user",
		userId: mcpSession.userId,
		plan: user.plan,
		litellmApiKey: user.litellmVirtualKey ?? undefined,
	}
}

// build an mcp call's analytics properties. it has no user agent
export function toMcpAnalyticsProperties(toolCaller: ToolCaller & { kind: "user" }): AnalyticsProperties {
	return {
		plan: toolCaller.plan,
		platform: toPlatform(undefined),
		browserPlatform: toBrowserPlatform(""),
		isInAppBrowser: false,
	}
}
