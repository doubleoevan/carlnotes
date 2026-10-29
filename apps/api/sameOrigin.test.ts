// same origin tests: a request counts as same-origin by its Sec-Fetch-Site header, else by its Origin header
import { afterEach, beforeEach, expect, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { isSameOriginRequest } from "./sameOrigin"

// the app's origin, set for each test and put back after
const restoreEnvSettings = saveEnvSettings(["BETTER_AUTH_URL"])

beforeEach(() => {
	Bun.env.BETTER_AUTH_URL = "https://carlnotes.test/"
})

afterEach(() => {
	restoreEnvSettings()
})

// a request to the app with the given headers
function toRequest(headers: Record<string, string>): Request {
	return new Request("https://carlnotes.test/api/topics/topic-1/view", { method: "POST", headers })
}

test("the Sec-Fetch-Site header decides, whatever the Origin header says", () => {
	expect(isSameOriginRequest(toRequest({ "sec-fetch-site": "same-origin" }))).toBe(true)
	expect(isSameOriginRequest(toRequest({ "sec-fetch-site": "cross-site", origin: "https://carlnotes.test" }))).toBe(
		false,
	)
	expect(isSameOriginRequest(toRequest({ "sec-fetch-site": "same-site" }))).toBe(false)
	expect(isSameOriginRequest(toRequest({ "sec-fetch-site": "none" }))).toBe(false)
})

test("with no Sec-Fetch-Site header, only the app's own Origin header passes", () => {
	expect(isSameOriginRequest(toRequest({ origin: "https://carlnotes.test" }))).toBe(true)
	expect(isSameOriginRequest(toRequest({ origin: "https://evil.test" }))).toBe(false)
	expect(isSameOriginRequest(toRequest({ origin: "null" }))).toBe(false)
	expect(isSameOriginRequest(toRequest({}))).toBe(false)
})

// the mobile app sends its platform header and no Origin. a browser's cross-site request keeps failing with it
test("the mobile app's platform header passes without an Origin header", () => {
	expect(isSameOriginRequest(toRequest({ "x-carlnotes-platform": "ios" }))).toBe(true)
	expect(isSameOriginRequest(toRequest({ "x-carlnotes-platform": "android" }))).toBe(true)
	expect(isSameOriginRequest(toRequest({ "x-carlnotes-platform": "web" }))).toBe(false)
	expect(isSameOriginRequest(toRequest({ "sec-fetch-site": "cross-site", "x-carlnotes-platform": "ios" }))).toBe(false)
})
