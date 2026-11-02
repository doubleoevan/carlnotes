// exact browser origins, with no header required for server-side clients
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as appUrlModule from "@carlnotes/server/appUrl"
import { Hono } from "hono"
import type { AppEnv } from "../currentUser"
import { validateMcpOrigin } from "./origins"

// restore the deployment url after each check
afterEach(() => mock.restore())

// a guarded handler that performs no account work
const route = new Hono<AppEnv>().use("*", validateMcpOrigin).all("*", (context) => context.body(null, 204))

test.each([null, "https://carlnotes.com", "http://localhost:5173"])("allows Origin %s", async (origin) => {
	// use the repository's fallback development origin
	spyOn(appUrlModule, "appUrl").mockReturnValue("http://localhost:5173")
	const response = await route.request("/mcp", { headers: origin === null ? {} : { origin } })
	expect(response.status).toBe(204)
})

test.each([
	"",
	"null",
	"https://attacker.example",
	"https://carlnotes.com.attacker.example",
	"http://carlnotes.com",
	"https://carlnotes.com:8443",
	"http://localhost:3000",
	"https://carlnotes.com/",
	"https://carlnotes.com/path",
	"https://carlnotes.com?query",
	"https://carlnotes.com#fragment",
	"https://user@carlnotes.com",
	"https://carlnotes.com https://attacker.example",
	"https://carlnotes.com, https://attacker.example",
	"file://carlnotes.com",
	"not a url",
])("rejects Origin %s", async (origin) => {
	// a forged host cannot add an origin to the allowlist
	spyOn(appUrlModule, "appUrl").mockReturnValue("https://carlnotes.com")
	const response = await route.request("https://attacker.example/mcp", {
		headers: { origin, host: "attacker.example", "x-forwarded-host": "attacker.example" },
	})
	expect(response.status).toBe(403)
	expect(await response.json()).toEqual({ error: "origin not allowed" })
	expect(response.headers.has("access-control-allow-origin")).toBe(false)
})

test("allows the configured deployment origin without admitting arbitrary localhost ports", async () => {
	// a tunnel or self-hosted deployment uses its configured application origin
	spyOn(appUrlModule, "appUrl").mockReturnValue("https://dev.carlnotes.com")
	const allowedResponse = await route.request("/mcp", { headers: { origin: "https://dev.carlnotes.com" } })
	const localResponse = await route.request("/mcp", { headers: { origin: "http://localhost:5173" } })
	expect(allowedResponse.status).toBe(204)
	expect(localResponse.status).toBe(403)
})

test.each(["file:///tmp/app", "ftp://carlnotes.com"])(
	"a non-HTTP deployment URL never permits Origin %s",
	async (url) => {
		// an invalid deployment setting cannot admit an opaque or non-HTTP origin
		spyOn(appUrlModule, "appUrl").mockReturnValue(url)
		const response = await route.request("/mcp", { headers: { origin: new URL(url).origin } })
		expect(response.status).toBe(403)
	},
)
