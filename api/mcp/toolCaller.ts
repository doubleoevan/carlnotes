// who is calling the mcp server: a visitor, or the user a bearer token resolves to, and the app each one calls from
import { toDeviceProperties, toUserAgentProduct } from "@shared/userAgent"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { oauthApplications, users } from "../../db/schema"
import { auth } from "../auth"
import type { AnalyticsProperties } from "../currentUser"

// who is calling, resolved once to a visitor or a user, with the name of the app the call came from
export type ToolCaller =
	| { kind: "visitor"; clientName: string }
	| { kind: "user"; userId: string; plan: string; clientName: string }

// the registered name of each app a token was issued to, read once per app
const clientNamesByClientId = new Map<string, string>()

// resolve the tool caller. an accepted bearer token means a user, anything else is a visitor
export async function resolveToolCaller(headers: Headers): Promise<ToolCaller> {
	// a visitor's app is named by its user agent's first product token
	const visitor = { kind: "visitor" as const, clientName: toUserAgentProduct(headers.get("user-agent")) }
	if (!headers.get("authorization")) {
		return visitor
	}

	// look the session up. a token the auth plugin rejects means a visitor
	const mcpSession = await auth.api.getMcpSession({ headers })
	if (!mcpSession?.userId) {
		return visitor
	}

	// read the user's plan, and the registered name of the app the token was issued to
	const [[user], clientName] = await Promise.all([
		db.select({ plan: users.plan }).from(users).where(eq(users.id, mcpSession.userId)),
		loadClientName(mcpSession.clientId),
	])
	// treat a token whose user is gone as a visitor
	if (!user) {
		return visitor
	}
	return { kind: "user", userId: mcpSession.userId, plan: user.plan, clientName: clientName ?? visitor.clientName }
}

// the registered name of the app with this client id, or undefined for an unregistered one
async function loadClientName(clientId: string): Promise<string | undefined> {
	const cachedClientName = clientNamesByClientId.get(clientId)
	if (cachedClientName) {
		return cachedClientName
	}

	// read the registration once, and keep its name
	const [oauthApplication] = await db
		.select({ name: oauthApplications.name })
		.from(oauthApplications)
		.where(eq(oauthApplications.clientId, clientId))
	// an unregistered client id is read again next time
	if (oauthApplication) {
		clientNamesByClientId.set(clientId, oauthApplication.name)
	}
	return oauthApplication?.name
}

// build an mcp call's analytics properties. it has no user agent
export function toMcpAnalyticsProperties(toolCaller: ToolCaller & { kind: "user" }): AnalyticsProperties {
	return { entryPoint: "mcp", plan: toolCaller.plan, ...toDeviceProperties(undefined) }
}
