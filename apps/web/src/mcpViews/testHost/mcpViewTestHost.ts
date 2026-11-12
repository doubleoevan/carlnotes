// the MCP view test host. it loads an MCP view's html in a sandboxed frame under its ui resource's content security
// policy, sends tool input, a tool result, and the host theme, and records what the MCP view asks for
import {
	type McpViewContentSecurityPolicy,
	toMcpViewContentSecurityPolicy,
	toMcpViewHtmlFromBundle,
	toMcpViewScriptFile,
} from "@carlnotes/contracts/mcpViewHtml"
import type { McpView } from "@carlnotes/contracts/mcpViews"
import type {
	McpUiDisplayMode,
	McpUiHostContext,
	McpUiToolInputNotification,
	McpUiToolResultNotification,
} from "@modelcontextprotocol/ext-apps"
import type { Browser, FrameLocator, Page } from "playwright-core"

// the site the MCP view's links and policy name
export const TEST_SITE_URL = "https://carlnotes.test"

// the host page, served to the test's own page and never from the network, on https as a real host is. a relative url in
// an MCP view's frame resolves here
export const HOST_PAGE_URL = "https://mcp-view-test-host.test/"
const HOST_SCRIPT_URL = `${HOST_PAGE_URL}hostPage.js`
const HOST_PAGE_HTML = `<!doctype html><body style="margin: 0"><script type="module" src="${HOST_SCRIPT_URL}"></script></body>`

// where build:ui and smoke:mcp-views write the MCP view bundle, relative to this folder
const MCP_VIEWS_BUNDLE_ROOT = `${import.meta.dir}/../../../dist/mcp-views`

// a tool call, a link, and a display mode request as the host receives them
type McpViewToolCall = { name: string; arguments?: Record<string, unknown> }
export type McpViewToolResult = McpUiToolResultNotification["params"]
type McpViewLink = { url: string }
type McpViewDisplayModeRequest = { mode: McpUiDisplayMode }

// the functions this module installs on the host page for its bridge
export type McpTestHostRecorder = {
	recordMcpViewToolCall: (toolCall: McpViewToolCall) => Promise<McpViewToolResult>
	recordMcpViewLink: (link: McpViewLink) => Promise<{ isError?: boolean }>
	recordMcpViewDisplayMode: (displayModeRequest: McpViewDisplayModeRequest) => Promise<{ mode: McpUiDisplayMode }>
}

// the functions the host page installs for this module
export type McpTestHostApi = {
	openMcpView: (options: {
		html: string
		hostContext: McpUiHostContext
		availableDisplayModes: McpUiDisplayMode[]
	}) => Promise<void>
	// what the host page sends to the open MCP view
	sendToolInput: (toolInput: McpUiToolInputNotification["params"]) => Promise<void>
	sendToolResult: (toolResult: McpViewToolResult) => Promise<void>
	sendHostContext: (hostContext: McpUiHostContext) => void
}

/**
 * How a test's host responds to a tool call.
 */
export type ToolCallResponder = (toolCall: McpViewToolCall) => McpViewToolResult

// what a test opens an MCP view with: its name, the host's theme and display modes, how the host responds to a tool
// call, a link, and a display mode, and the frame's width
export type OpenMcpViewOptions = {
	mcpView: McpView
	theme?: "light" | "dark"
	styles?: McpUiHostContext["styles"]
	availableDisplayModes?: McpUiDisplayMode[]
	respondToToolCall?: ToolCallResponder
	// whether the host declines a link or a display mode, and the frame's width
	isLinkDeclined?: boolean
	isDisplayModeDeclined?: boolean
	width?: number
}

// an open MCP view: the frame to read and click, what it asked the host for, and how to send it more
export type McpViewTestHost = {
	page: Page
	frame: FrameLocator
	toolCalls: McpViewToolCall[]
	links: string[]
	displayModeRequests: McpUiDisplayMode[]
	requestUrls: string[]
	contentSecurityViolations: string[]
	// how a test sends the MCP view more and closes the page
	sendToolInput: (toolArguments?: Record<string, unknown>) => Promise<void>
	sendToolResult: (toolResult: McpViewToolResult) => Promise<void>
	sendHostContext: (hostContext: McpUiHostContext) => Promise<void>
	close: () => Promise<void>
}

// a tool call's result if the test sets no other
const EMPTY_TOOL_RESULT: McpViewToolResult = { content: [] }

// the frame size a test sees if it sets no other
const DEFAULT_FRAME_WIDTH = 800
const FRAME_VIEWPORT_HEIGHT = 900

// how long a test waits for an element, shorter than the test's own limit so a failure names the element
const LOCATOR_TIMEOUT_MS = 10_000

// the host page's script, bundled once for every MCP view
let hostScript: string | null = null

/**
 * Opens an MCP view in its own page of the browser, connected to a host that holds its tool result until the test sends
 * it.
 */
export async function openMcpView(browser: Browser, options: OpenMcpViewOptions): Promise<McpViewTestHost> {
	const { mcpView, theme = "light", styles, availableDisplayModes = ["inline"], width = DEFAULT_FRAME_WIDTH } = options
	const { respondToToolCall = () => EMPTY_TOOL_RESULT, isLinkDeclined = false } = options
	const { isDisplayModeDeclined = false } = options

	// what the MCP view asks for, and what it loads or tries to load
	const toolCalls: McpViewToolCall[] = []
	const links: string[] = []
	const displayModeRequests: McpUiDisplayMode[] = []
	const requestUrls: string[] = []
	const contentSecurityViolations: string[] = []

	// a page that reaches no network. only the host page responds, and every other request is recorded and fails
	const page = await browser.newPage({ viewport: { width, height: FRAME_VIEWPORT_HEIGHT } })
	page.setDefaultTimeout(LOCATOR_TIMEOUT_MS)
	await page.route("**/*", async (route) => {
		const requestUrl = route.request().url()
		// serve the host page and its script
		if (requestUrl === HOST_PAGE_URL) {
			await route.fulfill({ contentType: "text/html", body: HOST_PAGE_HTML })
			return
		}
		if (requestUrl === HOST_SCRIPT_URL) {
			await route.fulfill({ contentType: "text/javascript", body: await toHostScript() })
			return
		}
		// record every other request and abort the request
		requestUrls.push(requestUrl)
		await route.abort()
	})

	// the browser reports a blocked load to the console and nowhere else
	page.on("console", (consoleMessage) => {
		if (consoleMessage.text().includes("Content Security Policy")) {
			contentSecurityViolations.push(consoleMessage.text())
		}
	})

	// the recorders the host page's bridge calls
	await page.exposeFunction("recordMcpViewToolCall", ({ name, arguments: toolArguments }: McpViewToolCall) => {
		const toolCall = { name, arguments: toolArguments }
		toolCalls.push(toolCall)
		return respondToToolCall(toolCall)
	})
	// record a link or a display mode request and return the host's response
	await page.exposeFunction("recordMcpViewLink", ({ url }: McpViewLink) => {
		links.push(url)
		return { isError: isLinkDeclined }
	})
	await page.exposeFunction("recordMcpViewDisplayMode", ({ mode }: McpViewDisplayModeRequest) => {
		displayModeRequests.push(mode)
		return { mode: availableDisplayModes.includes(mode) && !isDisplayModeDeclined ? mode : "inline" }
	})

	// load the host page, then the MCP view
	await page.goto(HOST_PAGE_URL)
	await page.waitForFunction(() => "mcpViewTestHost" in window)
	const html = await toTestHostHtml(mcpView)
	const openOptions = { html, hostContext: { theme, styles }, availableDisplayModes }
	await page.evaluate((hostOptions) => window.mcpViewTestHost.openMcpView(hostOptions), openOptions)

	// the open MCP view's frame, with its records and how to send it more
	const recordedRequests = { toolCalls, links, displayModeRequests, requestUrls, contentSecurityViolations }
	return {
		...recordedRequests,
		page,
		frame: page.frameLocator("iframe"),
		sendToolInput: (toolArguments = {}) =>
			page.evaluate((toolInput) => window.mcpViewTestHost.sendToolInput(toolInput), { arguments: toolArguments }),
		sendToolResult: (toolResult) =>
			page.evaluate((result) => window.mcpViewTestHost.sendToolResult(result), toolResult),
		sendHostContext: (hostContext) =>
			page.evaluate(
				(context) => window.mcpViewTestHost.sendHostContext(context as McpUiHostContext),
				hostContext as object,
			),
		close: () => page.close(),
	}
}

// bundle the host page's script for the browser
async function toHostScript(): Promise<string> {
	if (hostScript) {
		return hostScript
	}
	// build the host page and store its script text
	const hostPageBuild = await Bun.build({ entrypoints: [`${import.meta.dir}/hostPage.ts`], target: "browser" })
	const hostScriptFile = hostPageBuild.outputs[0]
	if (!hostScriptFile) {
		throw new Error("The host page did not build")
	}
	hostScript = await hostScriptFile.text()
	return hostScript
}

// an MCP view's html as the api builds it, with its ui resource's policy in the place a host applies it
async function toTestHostHtml(mcpView: McpView): Promise<string> {
	// read the MCP view's script and the one stylesheet
	const mcpViewScript = await Bun.file(`${MCP_VIEWS_BUNDLE_ROOT}/${toMcpViewScriptFile(mcpView)}`).text()
	const mcpViewStylesheet = await Bun.file(`${MCP_VIEWS_BUNDLE_ROOT}/mcpViews.css`).text()
	const mcpViewBundle = { mcpViewScript, mcpViewStylesheet }

	// the policy goes first in the head, so it covers everything after it
	const mcpViewHtml = toMcpViewHtmlFromBundle({ mcpView, mcpViewBundle, siteUrl: TEST_SITE_URL })
	const policy = toMcpViewContentSecurityPolicy({ siteUrl: TEST_SITE_URL, objectStorageOrigins: [] })
	return mcpViewHtml.replace(
		"<head>",
		`<head>\n<meta http-equiv="Content-Security-Policy" content="${toContentSecurityPolicyHeader(policy)}">`,
	)
}

// the header a host builds from a ui resource's policy, as the MCP Apps spec lays it out
function toContentSecurityPolicyHeader({ resourceDomains, baseUriDomains }: McpViewContentSecurityPolicy): string {
	const resourceSources = resourceDomains.join(" ")
	return [
		"default-src 'none'",
		`script-src 'self' 'unsafe-inline' ${resourceSources}`,
		`style-src 'self' 'unsafe-inline' ${resourceSources}`,
		`img-src 'self' data: ${resourceSources}`,
		`font-src 'self' data: ${resourceSources}`,
		`media-src 'self' data: ${resourceSources}`,
		"connect-src 'none'",
		"frame-src 'none'",
		"object-src 'none'",
		`base-uri ${baseUriDomains.join(" ")}`,
	].join("; ")
}
