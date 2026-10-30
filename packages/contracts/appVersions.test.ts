import { describe, expect, test } from "bun:test"
import { compareAppVersions, isAppVersionOutdatedResponse, isAppVersionSupported, parseAppVersion } from "./appVersions"
import { APP_STORE_ID, GET_THE_APP_PATH, PLAY_STORE_URL, toMobileStoreUrl } from "./mobileApp"

describe("parseAppVersion", () => {
	test("reads one to four dotted integers", () => {
		expect(parseAppVersion("1")).toEqual([1])
		expect(parseAppVersion("1.2.3")).toEqual([1, 2, 3])
		expect(parseAppVersion("1.2.3.4")).toEqual([1, 2, 3, 4])
	})

	test("rejects anything else", () => {
		expect(parseAppVersion("1.2.3-beta")).toBeNull()
		expect(parseAppVersion("v1.2")).toBeNull()
		expect(parseAppVersion("")).toBeNull()
		expect(parseAppVersion(undefined)).toBeNull()
	})
})

describe("compareAppVersions", () => {
	test("compares numerically, not lexically", () => {
		expect(compareAppVersions([1, 10, 0], [1, 9, 0])).toBe(1)
		expect(compareAppVersions([1, 2], [1, 2, 0])).toBe(0)
		expect(compareAppVersions([0, 9, 9], [1, 0, 0])).toBe(-1)
	})
})

describe("isAppVersionSupported", () => {
	test("an older build is unsupported and an equal or newer one is supported", () => {
		expect(isAppVersionSupported({ installedVersion: "1.1.9", minimumVersion: "1.2.0" })).toBe(false)
		expect(isAppVersionSupported({ installedVersion: "1.2.0", minimumVersion: "1.2.0" })).toBe(true)
		expect(isAppVersionSupported({ installedVersion: "1.10.0", minimumVersion: "1.2.0" })).toBe(true)
	})

	test("a missing or unparseable version on either side is served", () => {
		expect(isAppVersionSupported({ installedVersion: undefined, minimumVersion: "1.2.0" })).toBe(true)
		expect(isAppVersionSupported({ installedVersion: "1.0.0", minimumVersion: null })).toBe(true)
		expect(isAppVersionSupported({ installedVersion: "1.0.0-dev", minimumVersion: "1.2.0" })).toBe(true)
	})
})

describe("isAppVersionOutdatedResponse", () => {
	test("recognizes the rejection body alone", () => {
		expect(
			isAppVersionOutdatedResponse({ rejection: "appVersionOutdated", minimumVersion: "1.2.0", storeUrl: "x" }),
		).toBe(true)
		expect(isAppVersionOutdatedResponse({ error: "forbidden" })).toBe(false)
	})
})

describe("toMobileStoreUrl", () => {
	test("android updates from the Play listing", () => {
		expect(toMobileStoreUrl("android", "https://carlnotes.com")).toBe(PLAY_STORE_URL)
	})

	test("ios updates from the App Store once the id is known, and from the docs page before that", () => {
		// the record's url once the id exists, and the docs page before
		const url = toMobileStoreUrl("ios", "https://carlnotes.com")
		if (APP_STORE_ID) {
			expect(url).toBe(`https://apps.apple.com/app/id${APP_STORE_ID}`)
		} else {
			expect(url).toBe(`https://carlnotes.com${GET_THE_APP_PATH}`)
		}
	})
})
