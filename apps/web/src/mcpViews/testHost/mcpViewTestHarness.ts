// what every MCP view smoke test shares: the browser, an open MCP view, and the checks that read its frame
import { afterAll, beforeAll, expect, setDefaultTimeout } from "bun:test"
import { type Browser, chromium, type FrameLocator } from "playwright-core"
import { HOST_PAGE_URL, type McpViewTestHost, type OpenMcpViewOptions, openMcpView } from "./mcpViewTestHost"

// a page load and its first render take longer than a unit test's default
setDefaultTimeout(30_000)

// how often a test checks for something the host records
const RECORD_POLL_MS = 20

/**
 * The narrowest frame an MCP view lays out for.
 */
export const NARROW_FRAME_WIDTH = 320

// the browser every test opens its MCP view in
let browser: Browser
beforeAll(async () => {
	browser = await chromium.launch({ channel: "chrome", headless: true })
})
afterAll(() => browser.close())

/**
 * Opens an MCP view in the shared browser, for a test that reads the violations itself.
 */
export function openSmokeMcpView(options: OpenMcpViewOptions): Promise<McpViewTestHost> {
	return openMcpView(browser, options)
}

/**
 * Runs a test against an open MCP view, and closes it after.
 */
export async function withMcpView(
	options: OpenMcpViewOptions,
	runTest: (mcpViewTestHost: McpViewTestHost) => Promise<void>,
): Promise<void> {
	const mcpViewTestHost = await openSmokeMcpView(options)
	try {
		await runTest(mcpViewTestHost)
		// the MCP view has no content security violations and no requests to the host page's url
		expect(mcpViewTestHost.contentSecurityViolations).toEqual([])
		expect(mcpViewTestHost.requestUrls.filter((requestUrl) => requestUrl.startsWith(HOST_PAGE_URL))).toEqual([])
	} finally {
		await mcpViewTestHost.close()
	}
}

/**
 * Opens a table's two rows in turn, where one toggle remains to press only if each row opened alone.
 */
export async function expectOneOpenRow(frame: FrameLocator): Promise<void> {
	const showNotesButtons = frame.getByRole("button", { name: "Show Carl's notes" })
	const hideNotesButton = frame.getByRole("button", { name: "Hide Carl's notes" })

	// the first press opens the first row
	await showNotesButtons.first().click()
	await hideNotesButton.waitFor()

	// the second press opens the second row and closes the first
	await showNotesButtons.first().click()
	await hideNotesButton.waitFor()
	expect(await showNotesButtons.count()).toBe(1)
}

/**
 * Waits for the host to record something the MCP view asked for.
 */
export async function waitForRecord(records: unknown[], recordCount = 1): Promise<void> {
	while (records.length < recordCount) {
		await Bun.sleep(RECORD_POLL_MS)
	}
}

/**
 * Returns the text of the frame's document, for checks that read what shows.
 */
export function toFrameText(frame: FrameLocator): Promise<string> {
	// biome-ignore lint/performance/useDomNodeTextContent: these checks read the text that shows, which leaves out hidden text
	return frame.locator("body").innerText()
}

/**
 * Returns the styles a host's theme can change, read from the frame.
 */
export function toFrameStyle(frame: FrameLocator): Promise<{
	backgroundColor: string
	color: string
	radius: string
	isKarla: boolean
	hostFontWeight: string
}> {
	// read the body's and the root's computed styles in the frame
	return frame.locator("body").evaluate((body) => {
		const bodyStyle = getComputedStyle(body)
		const rootStyle = getComputedStyle(document.documentElement)
		return {
			backgroundColor: bodyStyle.backgroundColor,
			color: bodyStyle.color,
			radius: rootStyle.getPropertyValue("--radius"),
			isKarla: bodyStyle.fontFamily.includes("Karla"),
			hostFontWeight: document.documentElement.style.getPropertyValue("--font-weight-bold"),
		}
	})
}

/**
 * Waits for the frame's page to show a background color.
 */
export async function waitForFrameStyle(frame: FrameLocator, backgroundColor: string): Promise<void> {
	while ((await toFrameStyle(frame)).backgroundColor !== backgroundColor) {
		await Bun.sleep(RECORD_POLL_MS)
	}
}
