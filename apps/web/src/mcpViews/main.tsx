import { MCP_VIEWS, type McpView } from "@carlnotes/contracts/mcpViews"
import { createRoot } from "react-dom/client"
import "@/globals.css"
import { configureWebApiClient } from "@/lib/webApiClient"
import { McpViewApp } from "./McpViewApp"
import { installMcpViewFetch } from "./mcpViewFetch"

// the MCP view's fetch before any request, the api client the site's components read through, and the scripted class the
// site's first paint script adds, which shows the controls that need JavaScript, such as a page row of buttons
installMcpViewFetch()
configureWebApiClient()
document.documentElement.classList.add("scripted")

// the MCP view the html names, the search MCP view if it names none the bundle knows
const namedMcpView = document.body.dataset.mcpView as McpView | undefined
const mcpView = namedMcpView && MCP_VIEWS.includes(namedMcpView) ? namedMcpView : "search"

// render the MCP view into the html's root
const rootElement = document.getElementById("root")
if (rootElement) {
	createRoot(rootElement).render(<McpViewApp mcpView={mcpView} />)
}
