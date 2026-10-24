// apple provider tests: the client secret signs from the four values, a missing value leaves Apple off, a key pasted on
// one line still signs, a replaced secret is newer, the name and email arrive through Better Auth's provider, a
// returning user without an email keeps the stored one, and a closing account's tokens are revoked

import { afterEach, beforeAll, describe, expect, mock, spyOn, test } from "bun:test"
import { MOBILE_APP_BUNDLE_IDENTIFIER } from "@carlnotes/contracts/mobileApp"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { apple } from "better-auth/social-providers"
import { decodeJwt, decodeProtectedHeader, exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from "jose"
import {
	APPLE_CLIENT_SECRET_LIFETIME_SECONDS,
	APPLE_ID_ORIGIN,
	type AppleProviderValues,
	replaceAppleClientSecret,
	revokeAppleTokens,
	toAppleClientSecret,
	toAppleProfileUser,
	toAppleProviderOptions,
	toAppleProviderValues,
} from "./appleProvider"

// the longest client secret lifetime that Apple accepts
const APPLE_MAX_LIFETIME_SECONDS = 15_777_000

// a key pair made for these tests, in place of a real .p8 key
let publicKey: CryptoKey
let privateKeyText: string
let appleEnv: Record<string, string>
beforeAll(async () => {
	const keyPair = await generateKeyPair("ES256", { extractable: true })
	publicKey = keyPair.publicKey
	privateKeyText = await exportPKCS8(keyPair.privateKey)
	appleEnv = {
		APPLE_CLIENT_ID: "com.carlnotes.web",
		APPLE_TEAM_ID: "TEAM123456",
		APPLE_KEY_ID: "KEY1234567",
		APPLE_PRIVATE_KEY: privateKeyText,
	}
})

// the four values from the test environment
function toTestAppleProviderValues(): AppleProviderValues {
	const appleProviderValues = toAppleProviderValues(appleEnv)
	if (!appleProviderValues) {
		throw new Error("the test environment has every apple value")
	}
	return appleProviderValues
}

describe("toAppleClientSecret", () => {
	test("signs an ES256 jwt that names the key, the team, the services id, and apple", async () => {
		const appleClientSecret = await toAppleClientSecret(toTestAppleProviderValues())

		// the signature verifies against the public key. the header names the key
		const { payload } = await jwtVerify(appleClientSecret, publicKey, { audience: APPLE_ID_ORIGIN })
		expect(decodeProtectedHeader(appleClientSecret)).toEqual({ alg: "ES256", kid: "KEY1234567" })
		expect(payload.iss).toBe("TEAM123456")
		expect(payload.sub).toBe("com.carlnotes.web")
	})

	test("expires within apple's limit", async () => {
		const { iat, exp } = decodeJwt(await toAppleClientSecret(toTestAppleProviderValues()))
		expect((exp ?? 0) - (iat ?? 0)).toBe(APPLE_CLIENT_SECRET_LIFETIME_SECONDS)
		expect(APPLE_CLIENT_SECRET_LIFETIME_SECONDS).toBeLessThan(APPLE_MAX_LIFETIME_SECONDS)
	})
})

describe("toAppleProviderValues", () => {
	test("returns null if any of the four values is unset", () => {
		for (const valueName of Object.keys(appleEnv)) {
			expect(toAppleProviderValues({ ...appleEnv, [valueName]: undefined })).toBeNull()
			expect(toAppleProviderValues({ ...appleEnv, [valueName]: "" })).toBeNull()
			expect(toAppleProviderValues({ ...appleEnv, [valueName]: "  " })).toBeNull()
		}
	})

	test("trims the spaces around each value", () => {
		const spacedEnv = {
			...appleEnv,
			APPLE_CLIENT_ID: " com.carlnotes.web ",
			APPLE_TEAM_ID: "TEAM123456 ",
			APPLE_KEY_ID: " KEY1234567",
		}
		const appleProviderValues = toAppleProviderValues(spacedEnv)
		expect(appleProviderValues?.clientId).toBe("com.carlnotes.web")
		expect(appleProviderValues?.teamId).toBe("TEAM123456")
		expect(appleProviderValues?.keyId).toBe("KEY1234567")
	})

	test("turns literal \\n sequences in the key into line breaks", async () => {
		const oneLineKeyText = privateKeyText.replaceAll("\n", "\\n")
		const appleProviderValues = toAppleProviderValues({ ...appleEnv, APPLE_PRIVATE_KEY: oneLineKeyText })
		expect(appleProviderValues?.privateKey).toBe(privateKeyText)
	})
})

describe("toAppleProviderOptions", () => {
	test("leaves apple off without the values", async () => {
		const appleProviderOptions = await toAppleProviderOptions({})
		expect(appleProviderOptions.enabled).toBe(false)
	})

	test("leaves apple off if the key will not sign", async () => {
		using _consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
		const appleProviderOptions = await toAppleProviderOptions({ ...appleEnv, APPLE_PRIVATE_KEY: "not a key" })
		expect(appleProviderOptions.enabled).toBe(false)
	})

	test("signs a client secret and names the app's bundle identifier as the id token audience", async () => {
		const appleProviderOptions = await toAppleProviderOptions(appleEnv)
		expect(appleProviderOptions.enabled).toBeUndefined()
		expect(appleProviderOptions.clientId).toBe("com.carlnotes.web")
		expect(appleProviderOptions.appBundleIdentifier).toBe(MOBILE_APP_BUNDLE_IDENTIFIER)
		expect(appleProviderOptions.redirectURI).toBeUndefined()
		expect(decodeJwt(appleProviderOptions.clientSecret ?? "").sub).toBe("com.carlnotes.web")
	})

	test("returns to the dev redirect url in dev only", async () => {
		const devRedirectUrl = "https://apple-dev.carlnotes.com/api/auth/callback/apple"
		const devEnv = { ...appleEnv, APPLE_DEV_REDIRECT_URL: devRedirectUrl, DOPPLER_ENVIRONMENT: "dev" }
		expect((await toAppleProviderOptions(devEnv)).redirectURI).toBe(devRedirectUrl)

		// prd ignores a dev redirect url that was set by mistake
		const prdEnv = { ...devEnv, DOPPLER_ENVIRONMENT: "prd" }
		expect((await toAppleProviderOptions(prdEnv)).redirectURI).toBeUndefined()
	})
})

describe("replaceAppleClientSecret", () => {
	test("signs a newer secret into the same options", async () => {
		const appleProviderOptions = await toAppleProviderOptions(appleEnv)
		const firstClientSecret = await toAppleClientSecret(toTestAppleProviderValues(), new Date(Date.now() - 60_000))
		appleProviderOptions.clientSecret = firstClientSecret

		// a replaced secret was issued later than the first secret
		await replaceAppleClientSecret(appleProviderOptions, toTestAppleProviderValues())
		const firstIssuedAt = decodeJwt(firstClientSecret).iat ?? 0
		expect(decodeJwt(appleProviderOptions.clientSecret ?? "").iat ?? 0).toBeGreaterThan(firstIssuedAt)
	})

	test("keeps the current secret if signing fails", async () => {
		const appleProviderOptions = await toAppleProviderOptions(appleEnv)
		const currentClientSecret = appleProviderOptions.clientSecret
		using _consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
		await replaceAppleClientSecret(appleProviderOptions, { ...toTestAppleProviderValues(), privateKey: "not a key" })
		expect(appleProviderOptions.clientSecret).toBe(currentClientSecret)
	})
})

describe("the apple profile", () => {
	// an id token as Apple returns it. Better Auth reads its claims without checking the signature on the web flow
	async function toTestIdToken(email: string): Promise<string> {
		const signingKey = (await generateKeyPair("ES256")).privateKey
		const idTokenClaims = { sub: "apple-user-1", email, email_verified: "true", is_private_email: "false" }
		return new SignJWT(idTokenClaims).setProtectedHeader({ alg: "ES256" }).sign(signingKey)
	}

	test("takes the name from the posted user field and canonicalizes the email", async () => {
		const appleProvider = apple(await toAppleProviderOptions(appleEnv))
		const userInfo = await appleProvider.getUserInfo({
			idToken: await toTestIdToken("Ada@Example.com"),
			user: { name: { firstName: "Ada", lastName: "Lovelace" } },
		})
		expect(userInfo?.user.name).toBe("Ada Lovelace")
		expect(userInfo?.user.email).toBe("ada@example.com")
		expect(userInfo?.user.emailVerified).toBe(true)
	})

	test("has no name on a later sign-in, which posts no user field", async () => {
		const appleProvider = apple(await toAppleProviderOptions(appleEnv))
		const userInfo = await appleProvider.getUserInfo({ idToken: await toTestIdToken("ada@example.com") })
		expect(userInfo?.user.name).toBe("")
	})

	test("keeps a private relay address on the older domain and the newer one", async () => {
		const appleProvider = apple(await toAppleProviderOptions(appleEnv))
		for (const relayEmail of ["x7k2q9@privaterelay.appleid.com", "x7k2q9@private.icloud.com"]) {
			const userInfo = await appleProvider.getUserInfo({ idToken: await toTestIdToken(relayEmail) })
			expect(userInfo?.user.email).toBe(relayEmail)
		}
	})
})

describe("toAppleProfileUser", () => {
	// the connection pool's own query, put back after each test
	afterEach(() => {
		restoreConnectionPool()
	})

	test("canonicalizes an email from the id token without a query", async () => {
		const sentQueries = stubConnectionPool()
		expect(await toAppleProfileUser({ sub: "apple-user-1", email: "Ada@Example.com" })).toEqual({
			email: "ada@example.com",
		})
		expect(sentQueries).toHaveLength(0)
	})

	test("returns the stored email of the user who holds the apple account if the id token has none", async () => {
		const sentQueries = stubConnectionPool(() => [["ada@example.com"]])
		expect(await toAppleProfileUser({ sub: "apple-user-1" })).toEqual({ email: "ada@example.com" })

		// the lookup names the apple account by its subject
		expect(sentQueries[0]?.values).toEqual(["apple", "apple-user-1", 1])
	})

	test("returns no email for a new user whose id token has none", async () => {
		stubConnectionPool(() => [])
		expect(await toAppleProfileUser({ sub: "apple-user-2" })).toEqual({})
	})
})

describe("revokeAppleTokens", () => {
	// the connection pool's own query and the spied fetch, put back after each test
	afterEach(() => {
		restoreConnectionPool()
		mock.restore()
	})

	// the fetch that Apple's revoke endpoint answers, with the status given
	function stubAppleRevoke(status: number): ReturnType<typeof spyOn<typeof globalThis, "fetch">> {
		return spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status }))
	}

	test("posts the refresh token, the services id, and the client secret to apple", async () => {
		const appleProviderOptions = await toAppleProviderOptions(appleEnv)
		stubConnectionPool(() => [["refresh-token-1"]])
		const fetchSpy = stubAppleRevoke(200)
		await revokeAppleTokens(appleProviderOptions, "user-1")

		// the revoke names the refresh token and signs with the current secret
		const [revokeUrl, revokeInit] = fetchSpy.mock.calls[0] ?? []
		const revokeFields = new URLSearchParams(String(revokeInit?.body))
		expect(revokeUrl).toBe(`${APPLE_ID_ORIGIN}/auth/revoke`)
		expect(revokeFields.get("client_id")).toBe("com.carlnotes.web")
		expect(revokeFields.get("client_secret")).toBe(appleProviderOptions.clientSecret ?? "")
		expect(revokeFields.get("token")).toBe("refresh-token-1")
		expect(revokeFields.get("token_type_hint")).toBe("refresh_token")
	})

	test("sends nothing for an apple account without a refresh token", async () => {
		const appleProviderOptions = await toAppleProviderOptions(appleEnv)
		stubConnectionPool(() => [[null]])
		const fetchSpy = stubAppleRevoke(200)
		await revokeAppleTokens(appleProviderOptions, "user-1")
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	test("reports a revoke that apple rejects and does not throw an error", async () => {
		const appleProviderOptions = await toAppleProviderOptions(appleEnv)
		stubConnectionPool(() => [["refresh-token-1"]])
		spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "invalid_client" }, { status: 400 }))
		const reportErrorSpy = quietErrorReports()
		await revokeAppleTokens(appleProviderOptions, "user-1")
		expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "auth", { userId: "user-1" })

		// the reported error names Apple's reason
		const [reportedError] = reportErrorSpy.mock.calls[0] ?? []
		expect(String(reportedError)).toContain("invalid_client")
	})

	test("does nothing while apple is off", async () => {
		const sentQueries = stubConnectionPool()
		const fetchSpy = stubAppleRevoke(200)
		// no registered provider, and a provider that is off, both skip the revoke
		await revokeAppleTokens(undefined, "user-1")
		await revokeAppleTokens(await toAppleProviderOptions({}), "user-1")
		expect(sentQueries).toHaveLength(0)
		expect(fetchSpy).not.toHaveBeenCalled()
	})
})
