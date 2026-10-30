// auth client tests: the configured client is the one every later call returns, a configuration after a use throws,
// and the core hooks read the client through the function. the browser's own client is the one every web test uses,
// since none of them configures the client
import { beforeAll, expect, test } from "bun:test"
import type { BetterAuthClientPlugin } from "better-auth/client"
import { authClient, configureAuthClient, resetAuthClient, toAuthFetchErrorHandler } from "./authClient"

// every test file in a run shares the module's client, so this file starts with none
beforeAll(resetAuthClient)

// a client plugin that adds one action, the way the Expo plugin adds getCookie
const markerPlugin = {
	id: "marker",
	getActions: () => ({ marker: () => "configured" }),
} satisfies BetterAuthClientPlugin

// the app configures the client once, and shared code gets the same client with the api's fields
test("the configured client is the one every later call returns", () => {
	const appAuthClient = configureAuthClient({ baseURL: "https://api.example", plugins: [markerPlugin] })
	expect(appAuthClient.marker()).toBe("configured")
	expect(authClient()).toBe(appAuthClient as unknown as ReturnType<typeof authClient>)
	expect(typeof authClient().useSession).toBe("function")
})

// a second configuration, after the client is in use, is a bug the first launch should show
test("configuring the client after a use throws an error", () => {
	expect(() => configureAuthClient({ baseURL: "https://api.example", plugins: [] })).toThrow("already in use")
})

// the core hooks call the function, so a configured client reaches them
test("the core hooks read the client through authClient()", async () => {
	const hookSources = await Promise.all(
		["useAvatar", "useUsernameChange"].map((hookName) =>
			Bun.file(new URL(`../core/hooks/${hookName}.ts`, import.meta.url)).text(),
		),
	)
	for (const hookSource of hookSources) {
		expect(hookSource).toContain("authClient()")
		expect(hookSource).not.toMatch(/authClient\.[a-z$]/)
	}
})

// the Expo client has no cookie jar, so the app's sign-in reaches the gate through the auth client's own fetch
test("the auth client's fetch error handler reports a 426 and nothing else", () => {
	const outdatedCalls: number[] = []
	const handleError = toAuthFetchErrorHandler(() => outdatedCalls.push(1))
	handleError({ response: new Response(null, { status: 401 }) })
	expect(outdatedCalls).toHaveLength(0)

	// a 426 reports once, and a handler without the setting ignores it
	handleError({ response: new Response(null, { status: 426 }) })
	expect(outdatedCalls).toHaveLength(1)
	expect(() => toAuthFetchErrorHandler()({ response: new Response(null, { status: 426 }) })).not.toThrow()
})
