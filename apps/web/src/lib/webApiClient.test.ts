// where a server render reads the api, and what the web app's api client settings leave unset
import { expect, test } from "bun:test"
import { toServerApiBaseUrl, toWebApiClientSettings } from "./webApiClient"

test("a server render reads its own process unless API_ORIGIN names another origin", () => {
	// unset or empty, the render reads the api of its own process
	expect(toServerApiBaseUrl(undefined)).toBe("http://localhost:3000")
	expect(toServerApiBaseUrl("")).toBe("http://localhost:3000")

	// the origin the setting names, with no slash at its end to double a path's
	expect(toServerApiBaseUrl("http://app:3000")).toBe("http://app:3000")
	expect(toServerApiBaseUrl("http://app:3000/")).toBe("http://app:3000")
})

// the api's rate limiters skip a request with no session and no forwarded address, so a render must add neither
test("the web app's api client settings set no headers and no credentials mode", () => {
	const webApiClientSettings = toWebApiClientSettings("http://app:3000")
	expect(webApiClientSettings.apiBaseUrl).toBe("http://app:3000")
	expect(webApiClientSettings.headers).toBeUndefined()
	expect(webApiClientSettings.credentials).toBeUndefined()
})
