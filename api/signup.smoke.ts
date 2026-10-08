// a live smoke test that a visitor can pass the signup page's Turnstile challenge in a browser. the api serves the
// page with its content security policy, which once blocked the challenge's iframe, and only a browser shows that.
// the challenge's token then goes to the signup gate, which verifies it with Cloudflare.
// bun run smoke:signup builds the ui under doppler, then runs this test. it drives this machine's own Chrome
import { chromium } from "playwright-core"

// where build:ui writes the ui's server entry, which the api renders the signup page through
const UI_SERVER_ENTRY = "ui/dist/server/server.js"
// the api that serves the signup page, which this run serves itself if none is running
const API_ORIGIN = "http://localhost:3000"
// how long to wait for an api to respond before this run serves one itself
const API_WAIT_ATTEMPTS = 20
const API_WAIT_INTERVAL_MS = 500
// how long the email form and the challenge's token may take. the dev site key is Cloudflare's testing key,
// which issues a token without a person
const FORM_TIMEOUT_MS = 10_000
const CHALLENGE_TIMEOUT_MS = 20_000
// the hidden input that Turnstile fills with its token
const TOKEN_INPUT_SELECTOR = 'input[name="cf-turnstile-response"]'

// each check reports its own line, and one failure fails the run
let failureCount = 0
function check(label: string, isTestPassing: boolean, detail?: unknown): void {
	// print one line for a pass, and the detail for a failure
	if (isTestPassing) {
		console.log(`  ok  ${label}`)
		return
	}
	failureCount += 1
	console.error(`FAIL  ${label}`, detail ?? "")
}

// the ui has to be built, since the api renders the page through its server entry
if (!(await Bun.file(UI_SERVER_ENTRY).exists())) {
	console.error(`signup smoke: ${UI_SERVER_ENTRY} is missing, run bun run build:ui first`)
	process.exit(1)
}

// the api this run serves itself if none is running, and the browser, both stopped at the end
const apiServer = (await waitForApi()) ? null : Bun.serve((await import("./index")).default)
const browser = await chromium.launch({ channel: "chrome", headless: true })
try {
	// open the signup page, keeping every console message. a blocked frame is reported there and nowhere else
	const page = await browser.newPage()
	const consoleMessages: string[] = []
	page.on("console", (message) => consoleMessages.push(message.text()))
	await page.goto(`${API_ORIGIN}/signup`)

	// open the email form once the page has hydrated, so the button's click handler is attached
	await page.waitForLoadState("networkidle")
	await page.getByRole("button", { name: "Continue with email" }).click()
	const isFormOpen = await page
		.locator("#email")
		.waitFor({ timeout: FORM_TIMEOUT_MS })
		.then(() => true)
		.catch(() => false)
	check("the email form opens", isFormOpen)

	// wait for the challenge to fill its token
	const turnstileToken = await page
		.waitForFunction(
			(selector) => document.querySelector<HTMLInputElement>(selector)?.value || null,
			TOKEN_INPUT_SELECTOR,
			{ timeout: CHALLENGE_TIMEOUT_MS },
		)
		.then((tokenHandle) => tokenHandle.jsonValue() as Promise<string>)
		.catch(() => null)
	const policyViolations = consoleMessages.filter((text) => text.includes("Content Security Policy"))
	check("the page reports no content security policy violation", policyViolations.length === 0, policyViolations)
	check("the challenge issues a token", turnstileToken !== null, consoleMessages)

	// the gate verifies the token with Cloudflare and sets the cookie that signup reads
	const gateResponse = await fetch(`${API_ORIGIN}/api/signup-gate`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ turnstileToken: turnstileToken ?? "" }),
	})
	check("the signup gate accepts the token", gateResponse.status === 200, await gateResponse.text())
} finally {
	// close the browser, and stop the api this run started
	await browser.close()
	apiServer?.stop(true)
}

// one failure fails the run
if (failureCount > 0) {
	console.error(`${failureCount} check(s) failed`)
	process.exit(1)
}
console.log("signup smoke passed")
process.exit(0)

// whether an api responds on the port the page's loaders read within a few seconds. a dev api that watches the ui
// bundle restarts when build:ui rewrites the bundle, and takes the port before the api responds
async function waitForApi(): Promise<boolean> {
	for (let attempt = 0; attempt < API_WAIT_ATTEMPTS; attempt += 1) {
		try {
			if ((await fetch(`${API_ORIGIN}/api/health`)).ok) {
				return true
			}
		} catch {
			// nothing responds yet
		}
		await Bun.sleep(API_WAIT_INTERVAL_MS)
	}
	return false
}
