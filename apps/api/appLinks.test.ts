// the domain association documents: each is served as json from its Doppler value with an hour of caching, and 404
// while the value is unset
import { afterEach, expect, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { documentsRoute } from "./documents"

// put the two values back after each test
const restoreEnvSettings = saveEnvSettings(["APPLE_TEAM_ID", "ANDROID_SIGNING_FINGERPRINTS"])
afterEach(() => {
	restoreEnvSettings()
})

test("the apple document is served from the team id and 404 without one", async () => {
	// unset, 404
	delete Bun.env.APPLE_TEAM_ID
	expect((await documentsRoute.request("/.well-known/apple-app-site-association")).status).toBe(404)

	// set, the json document with the app id and an hour of caching
	Bun.env.APPLE_TEAM_ID = "TEAM123"
	const response = await documentsRoute.request("/.well-known/apple-app-site-association")
	expect(response.status).toBe(200)
	expect(response.headers.get("content-type")).toBe("application/json")
	expect(response.headers.get("cache-control")).toBe("public, max-age=3600")
	const document = (await response.json()) as { applinks: { details: { appIDs: string[] }[] } }
	expect(document.applinks.details[0]?.appIDs).toEqual(["TEAM123.com.carlnotes.app"])
})

test("the asset links are served from the fingerprints and 404 without any", async () => {
	// unset or blank, 404
	Bun.env.ANDROID_SIGNING_FINGERPRINTS = " , "
	expect((await documentsRoute.request("/.well-known/assetlinks.json")).status).toBe(404)

	// a comma separated list, trimmed
	Bun.env.ANDROID_SIGNING_FINGERPRINTS = "AA:BB, CC:DD"
	const response = await documentsRoute.request("/.well-known/assetlinks.json")
	expect(response.status).toBe(200)
	expect(response.headers.get("content-type")).toBe("application/json")
	const statements = (await response.json()) as { target: { sha256_cert_fingerprints: string[] } }[]
	expect(statements[0]?.target.sha256_cert_fingerprints).toEqual(["AA:BB", "CC:DD"])
})
