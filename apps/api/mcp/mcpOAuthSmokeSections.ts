// the oauth section of the mcp smoke: registration, authorize, consent, and the token exchange

import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider"
import { auth, MCP_RESOURCE_URL } from "../auth"
import { apiRequest, check, ownerEmail, ownerPassword } from "./mcpSmokeFixtures"
import { resolveToolCaller } from "./toolCaller"

// the oauth redirect uri, and the app's own origin
const REDIRECT_URI = "http://localhost:9999/callback"
const ORIGIN = Bun.env.BETTER_AUTH_URL ?? "http://localhost:5173"

// the client id that the oauth flow registers
export let registeredClientId = ""

// credentials stay in process; diagnostics report only statuses and public metadata
let refreshToken = ""

/** Checks the oauth flow from client registration to the access token, and returns it. */
export async function checkOAuth(): Promise<string> {
	// sign the owner in and keep the cookie
	const signIn = await auth.api.signInEmail({
		body: { email: ownerEmail, password: ownerPassword },
		headers: new Headers({ origin: ORIGIN }),
		asResponse: true,
	})
	const cookie = signIn.headers
		.getSetCookie()
		.map((cookieLine) => cookieLine.split(";")[0])
		.join("; ")
	check("the owner signs in", signIn.ok && cookie.length > 0, signIn.status)

	// register a client
	const registrationResponse = await apiRequest("/api/auth/oauth2/register", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			client_name: "mcp-smoke",
			redirect_uris: [REDIRECT_URI],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
		}),
	})
	const registrationJson = (await registrationResponse.json()) as { client_id?: string }
	registeredClientId = registrationJson.client_id ?? ""
	check(
		"dynamic client registration",
		registrationResponse.ok && registeredClientId.length > 0,
		registrationResponse.status,
	)

	// build the pkce pair and the authorize query
	const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
	const challengeBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
	const authorizeQuery = new URLSearchParams({
		client_id: registeredClientId,
		redirect_uri: REDIRECT_URI,
		response_type: "code",
		scope: "openid profile email offline_access",
		state: "smoke-state",
		code_challenge: Buffer.from(challengeBytes).toString("base64url"),
		code_challenge_method: "S256",
	})

	// walk authorize from signed out to the consent page
	const consentQuery = await checkAuthorize(authorizeQuery, cookie)

	// read the client's name, then accept the consent for a code
	const clientNameResponse = await apiRequest(`/api/mcp/clients/${registeredClientId}`, { headers: { cookie } })
	const clientNameJson = clientNameResponse.ok ? ((await clientNameResponse.json()) as { name: string }) : null
	check("the consent page can name the client", clientNameJson?.name === "mcp-smoke", clientNameResponse.status)
	const consentResponse = await apiRequest("/api/auth/oauth2/consent", {
		method: "POST",
		headers: { "content-type": "application/json", origin: ORIGIN, cookie },
		body: JSON.stringify({ accept: true, oauth_query: consentQuery.toString() }),
	})
	const consentJson = (await consentResponse.json()) as { url?: string }
	const authorizationCode = consentJson.url ? new URL(consentJson.url).searchParams.get("code") : null
	check(
		"consent returns the client's redirect with a code",
		consentResponse.ok && Boolean(authorizationCode),
		consentResponse.status,
	)

	// exchange the code and the verifier for a token, with the form body that the oauth token endpoint takes
	const tokenResponse = await apiRequest("/api/auth/oauth2/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code: authorizationCode ?? "",
			redirect_uri: REDIRECT_URI,
			client_id: registeredClientId,
			code_verifier: verifier,
		}),
	})
	const tokenJson = (await tokenResponse.json()) as { access_token?: string; refresh_token?: string }
	refreshToken = tokenJson.refresh_token ?? ""
	check(
		"the token exchange issues an access token",
		tokenResponse.ok && Boolean(tokenJson.access_token),
		tokenResponse.status,
	)
	return tokenJson.access_token ?? ""
}

/** Checks discovery, a successful refresh, and refresh revocation without claiming immediate JWT invalidation. */
export async function checkOAuthRevocation(accessToken: string): Promise<void> {
	const discovery = await oauthProviderAuthServerMetadata(auth)(
		new Request(`${ORIGIN}/.well-known/oauth-authorization-server`),
	)
	const metadata = (await discovery.json()) as {
		issuer?: string
		revocation_endpoint?: string
		token_endpoint?: string
	}
	check(
		"OAuth discovery advertises token and revocation endpoints",
		discovery.ok &&
			metadata.token_endpoint === `${ORIGIN}/api/auth/oauth2/token` &&
			metadata.revocation_endpoint === `${ORIGIN}/api/auth/oauth2/revoke`,
	)
	check("offline access issues a refresh token", Boolean(refreshToken))
	if (!metadata.revocation_endpoint || !refreshToken) {
		return
	}

	// rotate once to prove the refresh credential works before revoking its replacement
	const refreshed = await requestRefresh(refreshToken)
	const refreshedBody = (await refreshed.json()) as { access_token?: string; refresh_token?: string }
	check(
		"the refresh token issues another access token",
		refreshed.ok && Boolean(refreshedBody.access_token) && Boolean(refreshedBody.refresh_token),
		refreshed.status,
	)
	refreshToken = refreshedBody.refresh_token ?? refreshToken
	const revoked = await apiRequest(new URL(metadata.revocation_endpoint).pathname, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ client_id: registeredClientId, token: refreshToken, token_type_hint: "refresh_token" }),
	})
	check("the discovered endpoint revokes the refresh token", revoked.ok, revoked.status)

	// the refresh must fail, while the signed JWT remains usable until its own expiry
	const afterRevoke = await requestRefresh(refreshToken)
	const rejectedBody = (await afterRevoke.json()) as { error?: string }
	check(
		"a revoked refresh token cannot mint an access token",
		afterRevoke.status === 400 && rejectedBody.error === "invalid_grant",
		{ status: afterRevoke.status, error: rejectedBody.error },
	)
	const caller = await resolveToolCaller(
		new Request(MCP_RESOURCE_URL, { headers: { authorization: `Bearer ${accessToken}` } }),
	)
	check("an already-issued JWT still resolves after refresh revocation", caller.kind === "user")
	refreshToken = ""
}

// refresh through the same form endpoint used by a real OAuth client
function requestRefresh(token: string): Promise<Response> {
	return apiRequest("/api/auth/oauth2/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: token, client_id: registeredClientId }),
	})
}

/**
 * Checks authorize signed out, on the login page's return, as a form post, and signed in, and returns the signed query
 * the consent page receives.
 */
async function checkAuthorize(authorizeQuery: URLSearchParams, cookie: string): Promise<URLSearchParams> {
	// call authorize signed out. it redirects to the login page with the whole query
	const anonymousAuthorizeResponse = await apiRequest(`/api/auth/oauth2/authorize?${authorizeQuery}`, {
		redirect: "manual",
	})
	const loginLocation = anonymousAuthorizeResponse.headers.get("location") ?? ""
	check(
		"a signed-out authorize goes to the login page with the oauth query",
		loginLocation.startsWith("/login?") && loginLocation.includes("client_id="),
		loginLocation,
	)

	// return to authorize the way the login page does after signing in, with the whole signed query it was sent
	const loginQuery = new URL(loginLocation, ORIGIN).searchParams
	const loginReturnResponse = await apiRequest(`/api/auth/oauth2/authorize?${loginQuery}`, {
		redirect: "manual",
		headers: { cookie },
	})
	check(
		"the login page's return to authorize goes on to the consent page",
		(loginReturnResponse.headers.get("location") ?? "").startsWith("/mcp/consent?"),
		loginReturnResponse.headers.get("location"),
	)

	// post authorize as a form. it is redirected to the same request by get, so it cannot skip the consent page
	const authorizePostResponse = await apiRequest("/api/auth/oauth2/authorize", {
		method: "POST",
		redirect: "manual",
		headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie },
		body: authorizeQuery,
	})
	const authorizePostLocation = authorizePostResponse.headers.get("location") ?? ""
	check(
		"a posted authorize is redirected to the same request by get",
		authorizePostResponse.status === 303 && authorizePostLocation === `/api/auth/oauth2/authorize?${authorizeQuery}`,
		`${authorizePostResponse.status} ${authorizePostLocation}`,
	)

	// call authorize signed in. it redirects to the consent page
	const authorizeResponse = await apiRequest(`/api/auth/oauth2/authorize?${authorizeQuery}`, {
		redirect: "manual",
		headers: { cookie },
	})
	const consentLocation = authorizeResponse.headers.get("location") ?? ""
	const consentQuery = new URL(consentLocation, ORIGIN).searchParams
	check(
		"a signed-in authorize goes to the consent page with a signed query, never straight to a code",
		consentLocation.startsWith("/mcp/consent?") && consentQuery.has("sig"),
		consentLocation,
	)
	return consentQuery
}
