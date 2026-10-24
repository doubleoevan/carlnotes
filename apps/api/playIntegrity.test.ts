// Play Integrity verification: the service account key, the access token, and each verdict field
import { afterEach, beforeAll, expect, mock, spyOn, test } from "bun:test"
import { exportPKCS8, generateKeyPair } from "jose"
import {
	clearPlayIntegrityAccessToken,
	type PlayIntegrityServiceAccountKey,
	toPlayIntegrityServiceAccountKey,
	verifyPlayIntegrityToken,
} from "./playIntegrity"

// the package, the challenge, and the time every verdict is checked against
const PACKAGE_NAME = "com.carlnotes.app"
const CHALLENGE = "challenge-1"

// a token in the shape Google issues, a JWE of five parts
const INTEGRITY_TOKEN = "header.key.iv.ciphertext.tag"
const NOW = new Date("2026-10-24T12:00:00Z")

// a service account key over a generated RSA key
let serviceAccountKey: PlayIntegrityServiceAccountKey
beforeAll(async () => {
	const { privateKey } = await generateKeyPair("RS256", { extractable: true })
	serviceAccountKey = {
		clientEmail: "gate@carlnotes.iam.gserviceaccount.com",
		privateKey: await exportPKCS8(privateKey),
		tokenUri: "https://oauth2.googleapis.com/token",
	}
})

// the cached token and the spied fetch, put back after each test
afterEach(() => {
	clearPlayIntegrityAccessToken()
	mock.restore()
})

// a verdict for a genuine install, with any field overridden
function toVerdict(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		requestDetails: {
			requestPackageName: PACKAGE_NAME,
			requestHash: CHALLENGE,
			timestampMillis: String(NOW.getTime()),
		},
		appIntegrity: { appRecognitionVerdict: "PLAY_RECOGNIZED" },
		deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"] },
		...overrides,
	}
}

// the fetch that answers the token endpoint with an access token and the decode endpoint with the verdict
function stubGoogle(
	verdict: Record<string, unknown>,
	decodeStatus = 200,
): ReturnType<typeof spyOn<typeof globalThis, "fetch">> {
	return spyOn(globalThis, "fetch").mockImplementation((async (input: RequestInfo | URL) => {
		if (String(input) === serviceAccountKey.tokenUri) {
			return Response.json({ access_token: "access-1", expires_in: 3600 })
		}
		return Response.json({ tokenPayloadExternal: verdict }, { status: decodeStatus })
	}) as typeof fetch)
}

// verify a token against the stubbed Google
function verify(): ReturnType<typeof verifyPlayIntegrityToken> {
	return verifyPlayIntegrityToken({
		integrityToken: INTEGRITY_TOKEN,
		challenge: CHALLENGE,
		packageName: PACKAGE_NAME,
		serviceAccountKey,
		now: NOW,
	})
}

// a genuine install passes, and the decode request names the package and sends the access token
test("a passing verdict passes, decoded with the bearer for the package", async () => {
	const fetchSpy = stubGoogle(toVerdict())
	expect(await verify()).toEqual({ ok: true })

	// the second call is the decode
	const [decodeUrl, decodeInit] = fetchSpy.mock.calls[1] ?? []
	expect(String(decodeUrl)).toBe("https://playintegrity.googleapis.com/v1/com.carlnotes.app:decodeIntegrityToken")
	expect(new Headers(decodeInit?.headers).get("authorization")).toBe("Bearer access-1")
	expect(JSON.parse(String(decodeInit?.body))).toEqual({ integrityToken: INTEGRITY_TOKEN })
})

// each failing field is rejected with its own reason
test("each failing verdict field is rejected with its reason", async () => {
	const failingVerdicts: [string, Record<string, unknown>][] = [
		[
			"package",
			{
				requestDetails: {
					requestPackageName: "com.other.app",
					requestHash: CHALLENGE,
					timestampMillis: String(NOW.getTime()),
				},
			},
		],
		[
			"challenge",
			{
				requestDetails: {
					requestPackageName: PACKAGE_NAME,
					requestHash: "other",
					timestampMillis: String(NOW.getTime()),
				},
			},
		],
		[
			"stale",
			{
				requestDetails: {
					requestPackageName: PACKAGE_NAME,
					requestHash: CHALLENGE,
				},
				appIntegrity: { appRecognitionVerdict: "PLAY_RECOGNIZED" },
				deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"] },
			},
		],
		[
			"stale",
			{
				requestDetails: {
					requestPackageName: PACKAGE_NAME,
					requestHash: CHALLENGE,
					timestampMillis: String(NOW.getTime() - 6 * 60 * 1000),
				},
			},
		],
		["app", { appIntegrity: { appRecognitionVerdict: "UNRECOGNIZED_VERSION" } }],
		["device", { deviceIntegrity: {} }],
	]
	for (const [reason, overrides] of failingVerdicts) {
		stubGoogle(toVerdict(overrides))
		expect(await verify()).toEqual({ ok: false, reason })
		mock.restore()
	}
})

// a decode Google rejects is reported as a decode failure
test("a decode that Google rejects is rejected", async () => {
	stubGoogle(toVerdict(), 403)
	spyOn(console, "error").mockImplementation(() => undefined)
	expect(await verify()).toEqual({ ok: false, reason: "decode" })
})

// without the key nothing is decoded
test("a missing key rejects the proof without calling Google", async () => {
	const fetchSpy = stubGoogle(toVerdict())
	const check = await verifyPlayIntegrityToken({
		integrityToken: INTEGRITY_TOKEN,
		challenge: CHALLENGE,
		packageName: PACKAGE_NAME,
		serviceAccountKey: null,
	})
	expect(check).toEqual({ ok: false, reason: "play integrity is off" })
	expect(fetchSpy).not.toHaveBeenCalled()
})

// a token that is not a JWE never reaches Google, whose decodes count against a daily quota
test("a token that is not a JWE is rejected without a decode", async () => {
	const fetchSpy = stubGoogle(toVerdict())
	const check = await verifyPlayIntegrityToken({
		integrityToken: "not a token",
		challenge: CHALLENGE,
		packageName: PACKAGE_NAME,
		serviceAccountKey,
		now: NOW,
	})
	expect(check).toEqual({ ok: false, reason: "token" })
	expect(fetchSpy).not.toHaveBeenCalled()
})

// the access token is fetched once and reused while it lives
test("the access token is fetched once across verifications", async () => {
	const fetchSpy = stubGoogle(toVerdict())
	await verify()
	await verify()

	// one token request and two decodes
	const tokenRequestCount = fetchSpy.mock.calls.filter(([input]) => String(input) === serviceAccountKey.tokenUri).length
	expect(tokenRequestCount).toBe(1)
	expect(fetchSpy).toHaveBeenCalledTimes(3)
})

// the key comes from Google's JSON file, or is null if the value is unset or not that file
test("the service account key is read from the JSON file, with its line breaks restored", () => {
	expect(toPlayIntegrityServiceAccountKey({})).toBeNull()
	expect(toPlayIntegrityServiceAccountKey({ PLAY_INTEGRITY_SERVICE_ACCOUNT_KEY: " " })).toBeNull()
	expect(toPlayIntegrityServiceAccountKey({ PLAY_INTEGRITY_SERVICE_ACCOUNT_KEY: "not json" })).toBeNull()
	expect(
		toPlayIntegrityServiceAccountKey({ PLAY_INTEGRITY_SERVICE_ACCOUNT_KEY: JSON.stringify({ client_email: "a@b" }) }),
	).toBeNull()

	// a key pasted on one line
	const keyJson = JSON.stringify({
		client_email: "gate@carlnotes.iam.gserviceaccount.com",
		private_key: "-----BEGIN\\nabc\\n-----END\\n",
	})
	expect(toPlayIntegrityServiceAccountKey({ PLAY_INTEGRITY_SERVICE_ACCOUNT_KEY: keyJson })).toEqual({
		clientEmail: "gate@carlnotes.iam.gserviceaccount.com",
		privateKey: "-----BEGIN\nabc\n-----END",
		tokenUri: "https://oauth2.googleapis.com/token",
	})
})
