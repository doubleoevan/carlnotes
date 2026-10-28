// the api base url choice: the dev server's machine in development, and the site in production
import { expect, test } from "bun:test"
import { toApiBaseUrl } from "./apiBaseUrl"

// a production build reaches the site whatever the dev server address says
test("a production build reaches the production api", () => {
	expect(toApiBaseUrl({ isDevelopment: false })).toBe("https://carlnotes.com")
	expect(toApiBaseUrl({ isDevelopment: false, hostUri: "192.168.1.20:8081" })).toBe("https://carlnotes.com")
})

// a development build reaches the api port on the host the device reached the dev server on
test("a development build reaches the dev server's host on the api port", () => {
	expect(toApiBaseUrl({ isDevelopment: true, hostUri: "192.168.1.20:8081" })).toBe("http://192.168.1.20:3000")
	expect(toApiBaseUrl({ isDevelopment: true, hostUri: "localhost:8081" })).toBe("http://localhost:3000")
})

// the browser keeps separate cookies for the two loopback hostnames
test("an IPv4 loopback dev server uses the OAuth callback's localhost hostname", () => {
	expect(toApiBaseUrl({ isDevelopment: true, hostUri: "127.0.0.1:8084" })).toBe("http://localhost:3000")
})

// a development build without a dev server address falls back to localhost
test("a development build without a host falls back to localhost", () => {
	expect(toApiBaseUrl({ isDevelopment: true })).toBe("http://localhost:3000")
	expect(toApiBaseUrl({ isDevelopment: true, hostUri: "" })).toBe("http://localhost:3000")
})
