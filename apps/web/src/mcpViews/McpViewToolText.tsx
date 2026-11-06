import { type McpViewToolResult, toToolResultText } from "./mcpViewHost"

/**
 * A tool's own words, for a call that returned only text, such as a limit or a visitor's prompt to connect an account.
 */
export function McpViewToolText({ toolResult }: { toolResult: McpViewToolResult }) {
	return (
		<p role="alert" className="text-muted-foreground text-sm">
			{toToolResultText(toolResult.content)}
		</p>
	)
}
