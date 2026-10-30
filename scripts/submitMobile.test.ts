// the submit path's rules: the platform flag, the Doppler names each store needs, and key files that exist only for
// the length of the submit
import { expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { assertSubmitValues, removeSubmitKeyFiles, saveSubmitSetup, toSubmitPlatform } from "./submitMobile"

test("the platform comes from the flag, and anything else names it", () => {
	expect(toSubmitPlatform(["--platform", "ios"])).toBe("ios")
	expect(toSubmitPlatform(["--dry-run", "--platform", "android"])).toBe("android")
	expect(() => toSubmitPlatform([])).toThrow("--platform ios | android")
	expect(() => toSubmitPlatform(["--platform", "web"])).toThrow("--platform ios | android")
})

test("a missing Doppler value is named, never its content", () => {
	expect(() => assertSubmitValues("ios", { ASC_APP_ID: "1" })).toThrow(
		"APPLE_TEAM_ID, ASC_KEY_ID, ASC_ISSUER_ID, ASC_API_KEY_BASE64",
	)
	expect(() => assertSubmitValues("android", { PLAY_SERVICE_ACCOUNT_BASE64: "e30=" })).not.toThrow()
})

test("the ios key is written to a private folder, named in the environment, and removed after", () => {
	const setup = saveSubmitSetup("ios", {
		ASC_APP_ID: "123",
		APPLE_TEAM_ID: "TEAM",
		ASC_KEY_ID: "KEY",
		ASC_ISSUER_ID: "ISSUER",
		ASC_API_KEY_BASE64: Buffer.from("-----BEGIN PRIVATE KEY-----").toString("base64"),
	})
	expect(setup.env.EXPO_ASC_APP_ID).toBe("123")
	expect(readFileSync(setup.env.EXPO_ASC_API_KEY_PATH ?? "", "utf8")).toBe("-----BEGIN PRIVATE KEY-----")
	removeSubmitKeyFiles(setup)
	expect(existsSync(setup.env.EXPO_ASC_API_KEY_PATH ?? "")).toBe(false)
})

test("the Play key is written where the submit profile points and removed after", () => {
	const setup = saveSubmitSetup("android", {
		PLAY_SERVICE_ACCOUNT_BASE64: Buffer.from('{"type":"service_account"}').toString("base64"),
	})
	expect(readFileSync("apps/mobile/play-service-account.json", "utf8")).toBe('{"type":"service_account"}')
	removeSubmitKeyFiles(setup)
	expect(existsSync("apps/mobile/play-service-account.json")).toBe(false)
})
