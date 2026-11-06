// the MCP view's history. a shared component's navigation opens on the site and leaves the route where it was
import { afterAll, beforeAll, expect, mock, spyOn, test } from "bun:test"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"
import { mcpViewHistory, navigateMcpView, replaceMcpViewToolCall, toMcpViewToolCall } from "./mcpViewHistory"
import * as host from "./mcpViewHost"

// a tool call a route shows, and the host's link
const MCP_VIEW_TOOL_CALL = { toolResult: { content: [] }, toolArguments: null }
const openMcpViewLink = mock(async () => {})

// the DOM the history's guard checks for, and the host's link
let closeHarness: () => Promise<void>
beforeAll(async () => {
	spyOn(host, "openMcpViewLink").mockImplementation(openMcpViewLink)
	const harness = await renderTestHook(() => null)
	closeHarness = harness.close
	// set the site url and start on a Topic's findings route
	document.body.dataset.siteUrl = "https://carlnotes.test/"
	replaceMcpViewToolCall(MCP_VIEW_TOOL_CALL, "/findings/topic-1")
})
afterAll(() => closeHarness())

test.each([["/plans"], ["/signup?cta=podcast-question"]])("a navigation to %s opens on the site", async (path) => {
	mcpViewHistory.push(path)
	await waitForHook(() => openMcpViewLink.mock.calls.length > 0)
	expect(openMcpViewLink).toHaveBeenLastCalledWith(`https://carlnotes.test${path}`)
	expect(mcpViewHistory.location.pathname).toBe("/findings/topic-1")
	openMcpViewLink.mockClear()
})

test("a move keeps its tool call, and back returns to the tool call before it", () => {
	navigateMcpView("/findings/topic-2", { ...MCP_VIEW_TOOL_CALL, toolArguments: { topic_id: "topic-2" } })
	expect(mcpViewHistory.canGoBack()).toBe(true)
	expect(toMcpViewToolCall(mcpViewHistory.location.state)?.toolArguments).toEqual({ topic_id: "topic-2" })

	// back returns to the opening route with its tool call
	mcpViewHistory.back()
	expect(mcpViewHistory.location.pathname).toBe("/findings/topic-1")
	expect(toMcpViewToolCall(mcpViewHistory.location.state)?.toolArguments).toBeNull()
})
