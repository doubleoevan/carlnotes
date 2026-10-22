// who is calling the mcp server: a visitor, or the user a bearer token resolves to, and the app each one calls from
import { toDeviceProperties, toUserAgentProduct } from "@carlnotes/contracts/userAgent"
import { db } from "@carlnotes/db"
import { users } from "@carlnotes/db/schema/users"
import { appUrl } from "@carlnotes/server/appUrl"
import {
	createDpopReplayStore,
	enforceDpopBinding,
	parseAccessTokenAuthorization,
	verifyJwsAccessToken,
} from "better-auth/oauth2"
import { eq } from "drizzle-orm"
import { auth, MCP_RESOURCE_URL } from "../auth"
import type { AnalyticsProperties } from "../currentUser"
import { loadOAuthClientName } from "./oauthClientNames"

// who is calling, resolved once to a visitor or a user, with the name of the app the call came from
export type ToolCaller =
	| { kind: "visitor"; clientName: string }
	| { kind: "user"; userId: string; plan: string; clientName: string }

/**
 * Resolves the tool caller. A token the auth server signed for the MCP server means a user, and anything else is a
 * visitor.
 */
export async function resolveToolCaller(request: Request): Promise<ToolCaller> {
	// a visitor's app is named by its user agent's first product token
	const visitor = { kind: "visitor" as const, clientName: toUserAgentProduct(request.headers.get("user-agent")) }
	if (!request.headers.get("authorization")) {
		return visitor
	}

	// verify the token. one the auth server did not sign for the MCP server means a visitor
	const accessTokenClaims = await verifyMcpAccessToken(request)
	const userId = typeof accessTokenClaims?.sub === "string" ? accessTokenClaims.sub : null
	if (!userId) {
		return visitor
	}

	// read the user's plan, and the registered name of the app the token was issued to
	const clientId = typeof accessTokenClaims?.azp === "string" ? accessTokenClaims.azp : null
	const [[user], clientName] = await Promise.all([
		db.select({ plan: users.plan }).from(users).where(eq(users.id, userId)),
		clientId ? loadOAuthClientName(clientId) : null,
	])
	// treat a token whose user is gone as a visitor
	if (!user) {
		return visitor
	}
	return { kind: "user", userId, plan: user.plan, clientName: clientName ?? visitor.clientName }
}

// the claims a verified access token holds
type AccessTokenClaims = Awaited<ReturnType<typeof verifyJwsAccessToken>>

// the cache key for the auth server's signing keys, read in-process instead of over http
const MCP_JWKS_CACHE_KEY = {}

// the claims of a token the auth server signed for the MCP server, or null. the signing keys are read from the jwt
// plugin in-process. a DPoP-bound token must come with its proof, checked against the app's public url, since the
// request reaches the api through a proxy, and against a replay store in the database that every replica shares
async function verifyMcpAccessToken(request: Request): Promise<AccessTokenClaims | null> {
	const authorization = parseAccessTokenAuthorization(request.headers.get("authorization"))
	if (!authorization?.token || authorization.scheme === "Unknown") {
		return null
	}
	const { baseURL, internalAdapter } = await auth.$context
	const requestUrl = new URL(request.url)
	try {
		const accessTokenClaims = await verifyJwsAccessToken(authorization.token, {
			jwksFetch: () => auth.api.getJwks(),
			jwksCacheKey: MCP_JWKS_CACHE_KEY,
			verifyOptions: { issuer: baseURL, audience: MCP_RESOURCE_URL, typ: "at+jwt" },
		})
		await enforceDpopBinding({
			payload: accessTokenClaims,
			authorization,
			proofJwt: request.headers.get("dpop"),
			method: request.method,
			url: new URL(`${requestUrl.pathname}${requestUrl.search}`, appUrl()).toString(),
			replayStore: createDpopReplayStore(internalAdapter),
		})
		return accessTokenClaims
	} catch {
		return null
	}
}

/**
 * Builds an mcp call's analytics properties. It has no user agent.
 */
export function toMcpAnalyticsProperties(toolCaller: ToolCaller & { kind: "user" }): AnalyticsProperties {
	return { entryPoint: "mcp", plan: toolCaller.plan, ...toDeviceProperties(undefined) }
}
