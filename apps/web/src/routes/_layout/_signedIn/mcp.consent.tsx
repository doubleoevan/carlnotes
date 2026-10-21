import { createFileRoute } from "@tanstack/react-router"
import { McpConsentPage } from "@/pages/McpConsentPage"

// the consent step of an MCP client's sign-in
export const Route = createFileRoute("/_layout/_signedIn/mcp/consent")({
	component: McpConsentPage,
})
