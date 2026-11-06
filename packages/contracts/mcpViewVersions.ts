// the MCP view versions stored in object storage for hosts locked to them. bun run mcp-views:freeze adds to the manifest
import type { McpView } from "./mcpViews"
import storedMcpViewVersions from "./mcpViewVersions.json"

// a stored version, and the MCP views its bundle holds
export type StoredMcpViewVersion = { version: number; mcpViews: McpView[] }

export const STORED_MCP_VIEW_VERSIONS = storedMcpViewVersions as StoredMcpViewVersion[]
