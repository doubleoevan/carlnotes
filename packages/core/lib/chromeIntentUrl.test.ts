import { expect, test } from "bun:test"
import { toChromeIntentUrl } from "./chromeIntentUrl"

test("the chrome intent includes the page and a fallback for a device without chrome", () => {
	const intentUrl = toChromeIntentUrl("https://carlnotes.com/signup?cta=subscribe")

	// the wrapped url drops its scheme, which the intent names at its own end instead
	expect(intentUrl).toStartWith("intent://carlnotes.com/signup?cta=subscribe#Intent;")
	expect(intentUrl).toContain("scheme=https")
	expect(intentUrl).toContain("package=com.android.chrome")
	expect(intentUrl).toContain(
		`S.browser_fallback_url=${encodeURIComponent("https://carlnotes.com/signup?cta=subscribe")}`,
	)
})

test("the intent keeps the page's own scheme, so a local http page opens as one", () => {
	expect(toChromeIntentUrl("http://localhost:5173/login")).toContain("scheme=http;")
})

// a # in the page url would start the intent's own fields, so the intent path stops before it and the fallback keeps it
test("the intent path drops the page url's fragment, and the fallback url keeps it", () => {
	const intentUrl = toChromeIntentUrl("https://carlnotes.com/docs/teams#roles")
	expect(intentUrl).toStartWith("intent://carlnotes.com/docs/teams#Intent;")
	expect(intentUrl).toContain(`S.browser_fallback_url=${encodeURIComponent("https://carlnotes.com/docs/teams#roles")}`)
})
