import { MCP_CARDS, type McpCard } from "@carlnotes/contracts/mcpCards"
import { createRoot } from "react-dom/client"
import "@/globals.css"
import { configureWebApiClient } from "@/lib/webApiClient"
import { installCardFetch } from "./cardFetch"
import { McpCardApp } from "./McpCardApp"

// the card's fetch before any request, the api client the site's components read through, and the scripted class the
// site's first paint script adds, which shows the controls that need JavaScript, such as a page row of buttons
installCardFetch()
configureWebApiClient()
document.documentElement.classList.add("scripted")

// the card the html names, the search card if it names none the bundle knows
const namedMcpCard = document.body.dataset.card as McpCard | undefined
const mcpCard = namedMcpCard && MCP_CARDS.includes(namedMcpCard) ? namedMcpCard : "search"

// render the card into the html's root
const rootElement = document.getElementById("root")
if (rootElement) {
	createRoot(rootElement).render(<McpCardApp mcpCard={mcpCard} />)
}
