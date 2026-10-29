// api request settings tests: the cookie header, no header without a cookie, and one sign-out for a burst of 401s

import { expect, test } from "bun:test"
import { PLATFORM_HEADER } from "@carlnotes/contracts/clientTelemetry"
import { toApiRequestSettings } from "./apiRequestSettings"

// the settings over fakes: a cookie, a session, and a sign-out that resolves when the test says so
function toTestSettings(cookie: string): {
	settings: ReturnType<typeof toApiRequestSettings>
	signOutCount: () => number
	finishSignOut: () => void
	endSession: () => void
} {
	// the fakes' state
	let signOutCount = 0
	let isSessionHeld = true
	let finishSignOut = (): void => {}

	// the settings read the fakes
	const settings = toApiRequestSettings({
		getCookie: async () => cookie,
		hasSession: () => isSessionHeld,
		signOut: () => {
			signOutCount++
			return new Promise<void>((resolve) => {
				finishSignOut = resolve
			})
		},
	})
	return {
		settings,
		signOutCount: () => signOutCount,
		finishSignOut: () => finishSignOut(),
		endSession: () => {
			isSessionHeld = false
		},
	}
}

// the stored cookie goes as the Cookie header, with the platform's credentials omitted
test("the headers send the stored cookie with credentials omitted", async () => {
	const { settings } = toTestSettings("carlnotes.session_token=abc")
	expect(await settings.headers()).toEqual({ cookie: "carlnotes.session_token=abc" })
	expect(settings.credentials).toBe("omit")
})

// without a stored cookie, no header goes
test("no stored cookie sends no header", async () => {
	const { settings } = toTestSettings("")
	expect(await settings.headers()).toEqual({})
})

// a public read asks for no credentials, and the cookie is left off so the edge can share the response
test("a call that omits credentials sends no cookie", async () => {
	const { settings } = toTestSettings("carlnotes.session_token=abc")
	expect(await settings.headers({ credentials: "omit" })).toEqual({})
	expect(await settings.headers({ credentials: "same-origin" })).toEqual({ cookie: "carlnotes.session_token=abc" })
})

// a screen's requests can return several 401s at once. one sign-out runs, and none while no session is held
test("a burst of 401s signs out once, and a signed-out client not at all", async () => {
	const { settings, signOutCount, finishSignOut, endSession } = toTestSettings("carlnotes.session_token=abc")
	settings.onUnauthorized()
	settings.onUnauthorized()
	expect(signOutCount()).toBe(1)

	// once the sign-out settles and the session is gone, a later 401 signs out nothing
	finishSignOut()
	await Bun.sleep(0)
	endSession()
	settings.onUnauthorized()
	expect(signOutCount()).toBe(1)
})

// device descriptions accompany both signed-in and visitor requests without replacing authentication
test("native attribution preserves the stored cookie", async () => {
	const deviceHeaders = { [PLATFORM_HEADER]: "ios", "x-carlnotes-device-model": "iPhone 18 Pro" }
	const settings = toApiRequestSettings({
		getCookie: async () => "session=test",
		hasSession: () => true,
		signOut: async () => undefined,
		deviceHeaders,
	})
	expect(await settings.headers()).toEqual({ ...deviceHeaders, cookie: "session=test" })
})
