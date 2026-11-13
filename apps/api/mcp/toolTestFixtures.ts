// the registered tools that the tool tests read, without a server or a transport, and the text of a tool result
import type { CallToolResult } from "@modelcontextprotocol/server"
import type { ToolCaller } from "./toolCaller"
import { registerTools } from "./tools"

// a registered tool's title, description, and annotations, and its handler
type RegisteredToolConfig = {
	title?: string
	description?: string
	annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }
}
export type RegisteredToolHandler = (toolArguments: Record<string, unknown>) => Promise<CallToolResult>

// a visitor, and a user connected through an app
export const VISITOR: ToolCaller = { kind: "visitor", clientName: "test-app" }
export const USER: ToolCaller = {
	kind: "user",
	userId: "user-1",
	plan: "free",
	clientName: "test-app",
	clientId: "test-client",
}

/**
 * Returns the text of a tool result.
 */
export function toResultText(toolResult: unknown): string {
	const resultContent = (toolResult as { content?: { type: string; text?: string }[] }).content ?? []
	return resultContent.map((contentPart) => contentPart.text ?? "").join("\n")
}

/**
 * Returns the tools a caller gets, by name, each with its config and handler. routeTopicId is the bound Topic.
 */
export function toRegisteredTools(
	toolCaller: ToolCaller,
	routeTopicId: string | null = null,
): Map<string, { config: RegisteredToolConfig; handler: RegisteredToolHandler }> {
	// a fake server that keeps each registered tool by its name
	const registeredTools = new Map<string, { config: RegisteredToolConfig; handler: RegisteredToolHandler }>()
	const fakeMcpServer = {
		registerTool: (toolName: string, config: RegisteredToolConfig, handler: RegisteredToolHandler) => {
			registeredTools.set(toolName, { config, handler })
			return {}
		},
		registerResource: () => ({}),
	}
	registerTools({
		mcpServer: fakeMcpServer as unknown as Parameters<typeof registerTools>[0]["mcpServer"],
		toolCaller,
		routeTopicId,
		clientAddress: null,
	})
	return registeredTools
}

/**
 * Returns one registered tool's handler as the caller gets it, on the plain route or a bound one.
 */
export function toToolHandler(
	toolName: string,
	toolCaller: ToolCaller = USER,
	routeTopicId: string | null = null,
): RegisteredToolHandler {
	const handler = toRegisteredTools(toolCaller, routeTopicId).get(toolName)?.handler
	if (!handler) {
		throw new Error(`${toolName} is not registered`)
	}
	return handler
}
