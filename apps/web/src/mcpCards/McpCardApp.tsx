import type { McpCard, McpSearchPage, McpTopicCardResult } from "@carlnotes/contracts/mcpCards"
import { useApp } from "@modelcontextprotocol/ext-apps/react"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { createContext, type ReactNode, useContext, useEffect, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { LinkOpenerContext } from "@/components/common/AnchorLink"
import { openHostLink, setCardApp, setCardData } from "./cardHost"
import { FindingsCard } from "./FindingsCard"
import { SearchCard } from "./SearchCard"
import { TopicCard } from "./TopicCard"

// what a card renders from: the tool result's structured content and the arguments the tool was called with
type CardToolCall = { structuredContent: unknown; toolArguments: Record<string, unknown> | null }

// the card's tool call, which the root route's component reads
const CardToolCallContext = createContext<{ mcpCard: McpCard; cardToolCall: CardToolCall | null } | null>(null)

// a router with one route, so a shared component's router hooks work inside a card. every link opens through the host
const cardRouter = createRouter({
	routeTree: createRootRoute({ component: CardBody }),
	history: createMemoryHistory({ initialEntries: ["/"] }),
})

/**
 * An mcp card in its host's frame: it connects to the host, follows the host's theme, and renders the card its html
 * names from each tool result.
 */
export function McpCardApp({ mcpCard }: { mcpCard: McpCard }) {
	// the tool call the card shows, set from the host's notifications
	const [cardToolCall, setCardToolCall] = useState<CardToolCall | null>(null)
	const [toolArguments, setToolArguments] = useState<Record<string, unknown> | null>(null)
	const { app } = useApp({
		appInfo: { name: "carlnotes-card", version: "1.0.0" },
		capabilities: {},
		onAppCreated: (createdApp) => {
			// keep the tool's arguments, then show its result with the card data beside it
			createdApp.ontoolinput = (toolInput) => setToolArguments(toolInput.arguments ?? null)
			createdApp.ontoolresult = (toolResult) => {
				setCardData(toolResult._meta)
				setCardToolCall({ structuredContent: toolResult.structuredContent, toolArguments: null })
			}
			createdApp.onhostcontextchanged = (hostContext) => applyHostTheme(hostContext.theme)
		},
	})

	// keep the connected app for the card's links and tool calls, and take the host's theme
	useEffect(() => {
		setCardApp(app)
		applyHostTheme(app?.getHostContext()?.theme)
	}, [app])
	// a host frames the card edge to edge, so the card keeps its own margin inside the frame
	const shownToolCall = cardToolCall ? { ...cardToolCall, toolArguments } : null
	return (
		<LinkOpenerContext.Provider value={openHostLink}>
			<CardToolCallContext.Provider value={{ mcpCard, cardToolCall: shownToolCall }}>
				<div className="p-3">
					<RouterProvider router={cardRouter} />
				</div>
			</CardToolCallContext.Provider>
		</LinkOpenerContext.Provider>
	)
}

// the card's body: the loading state until a tool result arrives, then the card its html names
function CardBody(): ReactNode {
	const cardToolCallValue = useContext(CardToolCallContext)
	if (!cardToolCallValue?.cardToolCall) {
		return <CoffeeLoading />
	}

	// the findings card reads its card data. any other card shows nothing for a result with no structured content, a
	// rejection the model reads
	const { mcpCard, cardToolCall } = cardToolCallValue
	if (mcpCard === "findings") {
		return <FindingsCard />
	}
	if (!cardToolCall.structuredContent) {
		return null
	}
	return mcpCard === "search" ? (
		<SearchCard mcpSearchPage={cardToolCall.structuredContent as McpSearchPage} />
	) : (
		<TopicCard
			mcpTopicCardResult={cardToolCall.structuredContent as McpTopicCardResult}
			editTopicArguments={cardToolCall.toolArguments}
		/>
	)
}

// follow the host's light or dark theme with the class the Nightshift tokens read
function applyHostTheme(theme: string | undefined): void {
	if (theme) {
		document.documentElement.classList.toggle("dark", theme === "dark")
	}
}
