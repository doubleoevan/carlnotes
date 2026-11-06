// the page that acts as the host in the MCP view tests. it loads an MCP view's html in a sandboxed frame and speaks the
// MCP Apps host bridge to it, and mcpViewTestHost.ts drives it from outside the browser
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge"
import type { McpTestHostApi, McpTestHostRecorder } from "./mcpViewTestHost"

// what mcpViewTestHost.ts installs on this page, and what this page installs for it
declare global {
	interface Window extends McpTestHostRecorder {
		mcpViewTestHost: McpTestHostApi
	}
}

// the bridge to the open MCP view
let appBridge: AppBridge | null = null

// the frame holds no same-origin grant, so the MCP view runs on an opaque origin as it does in a real host
const FRAME_SANDBOX = "allow-scripts"

/**
 * Returns the bridge to the open MCP view, or throws an error if none is open.
 */
function toOpenAppBridge(): AppBridge {
	if (!appBridge) {
		throw new Error("No MCP view is open")
	}
	return appBridge
}

window.mcpViewTestHost = {
	openMcpView: async ({ html, hostContext, availableDisplayModes }) => {
		// the frame the MCP view runs in, which starts empty so the bridge is listening before its script runs
		const frame = document.createElement("iframe")
		frame.setAttribute("sandbox", FRAME_SANDBOX)
		frame.title = "MCP view"
		frame.style.cssText = "display: block; width: 100%; height: 600px; border: 0"
		document.body.append(frame)
		// read the frame's window and throw an error if the frame has none
		const frameWindow = frame.contentWindow
		if (!frameWindow) {
			throw new Error("The MCP view frame has no window")
		}

		// the bridge to the frame
		const openAppBridge = new AppBridge(
			null,
			{ name: "carlnotes-test-host", version: "1.0.0" },
			{ openLinks: {}, serverTools: {} },
			{ hostContext: { ...hostContext, availableDisplayModes } },
		)
		appBridge = openAppBridge

		// record each request from the MCP view
		openAppBridge.oncalltool = (toolCall) => window.recordMcpViewToolCall(toolCall)
		openAppBridge.onopenlink = (link) => window.recordMcpViewLink(link)
		openAppBridge.onrequestdisplaymode = (displayModeRequest) => window.recordMcpViewDisplayMode(displayModeRequest)

		// fit the frame to the MCP view, as a host does
		openAppBridge.onsizechange = ({ height }) => {
			if (height) {
				frame.style.height = `${height}px`
			}
		}

		// load the MCP view, and return once it has connected
		const connection = new Promise<void>((resolve) => {
			openAppBridge.oninitialized = () => resolve()
		})
		await openAppBridge.connect(new PostMessageTransport(frameWindow, frameWindow))
		frame.srcdoc = html
		await connection
	},
	sendToolInput: (toolInput) => toOpenAppBridge().sendToolInput(toolInput),
	sendToolResult: (toolResult) => toOpenAppBridge().sendToolResult(toolResult),
	sendHostContext: (hostContext) => toOpenAppBridge().setHostContext(hostContext),
}
