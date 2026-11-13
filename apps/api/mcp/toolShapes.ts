// what every tool registration shares: the topic id argument, the options the registrations take, and the shapes a
// tool's result takes
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import type { McpPage } from "./results"
import type { ToolCaller } from "./toolCaller"

// the topic id argument every topic tool takes. on the bound route the topic id comes from the url
export const topicIdArgument = z
	.string()
	.optional()
	.describe("The topic's id. Optional on a topic-bound server, which already knows its topic.")

// the server the tools register on, who is calling, the topic the route binds, and the client address a visitor's
// search counts under
export type RegisterToolsOptions = {
	mcpServer: McpServer
	toolCaller: ToolCaller
	routeTopicId: string | null
	clientAddress: string | null
}

/**
 * Shapes a page as a tool result, as json text and as structured content. Some clients read only the text.
 */
export function toPageResult(mcpPage: McpPage<unknown> | null): CallToolResult {
	if (!mcpPage) {
		return toTextResult("No readable topic has that id.", true)
	}
	return toJsonResult(mcpPage)
}

/**
 * Shapes a result as json text and as the same structured content.
 */
export function toJsonResult(result: Record<string, unknown>): CallToolResult {
	return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result }
}

/**
 * Shapes a write's line as a tool result, with its structured status.
 */
export function toStatusResult(text: string, structuredContent: Record<string, unknown>): CallToolResult {
	return { content: [{ type: "text", text }], structuredContent }
}

/**
 * Shapes text as a tool result.
 */
export function toTextResult(text: string, isError = false): CallToolResult {
	return { content: [{ type: "text", text }], isError }
}
