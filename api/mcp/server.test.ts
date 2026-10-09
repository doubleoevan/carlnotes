// the tool call tracker reports each call's outcome: ok, rejected for a result flagged as an error, and failed for a
// thrown error
import { expect, spyOn, test } from "bun:test"
import * as analytics from "@shared/analytics"
import { trackToolCalls } from "./server"

// a registered tool's handler
type FakeToolHandler = (...handlerArguments: unknown[]) => Promise<{ content: never[]; isError?: boolean }>

test("trackToolCalls reports an ok, a rejected, and a failed tool call by the app's name", async () => {
	const trackBotEventSpy = spyOn(analytics, "trackBotEvent").mockImplementation(() => {})

	// a fake server that keeps each registered handler by its tool's name
	const registeredHandlers = new Map<string, FakeToolHandler>()
	const fakeMcpServer = {
		registerTool: (toolName: string, _config: unknown, handler: FakeToolHandler) => {
			registeredHandlers.set(toolName, handler)
			return {}
		},
	}
	trackToolCalls(fakeMcpServer as unknown as Parameters<typeof trackToolCalls>[0], {
		kind: "visitor",
		clientName: "test-app",
	})

	// register one tool per outcome, then call each
	fakeMcpServer.registerTool("ok_tool", {}, async () => ({ content: [] }))
	fakeMcpServer.registerTool("rejected_tool", {}, async () => ({ content: [], isError: true }))
	fakeMcpServer.registerTool("failed_tool", {}, async () => {
		throw new Error("boom")
	})
	await registeredHandlers.get("ok_tool")?.()
	await registeredHandlers.get("rejected_tool")?.()
	await expect(registeredHandlers.get("failed_tool")?.()).rejects.toThrow("boom")

	// each call reports by the app's name, with the tool and its outcome
	const toolCallProperties = { entryPoint: "mcp", clientName: "test-app", callerKind: "visitor" }
	expect(trackBotEventSpy.mock.calls).toEqual([
		["mcp_tool_called", "test-app", { ...toolCallProperties, tool: "ok_tool", outcome: "ok" }],
		["mcp_tool_called", "test-app", { ...toolCallProperties, tool: "rejected_tool", outcome: "rejected" }],
		["mcp_tool_called", "test-app", { ...toolCallProperties, tool: "failed_tool", outcome: "failed" }],
	])
	trackBotEventSpy.mockRestore()
})
