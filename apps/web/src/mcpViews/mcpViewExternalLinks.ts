// the MCP view's way out to a url, which opens through the host. a sandboxed frame opens no tab of its own, and the
// MCP view build puts this module in place of @/lib/externalLinks
import type * as externalLinks from "@/lib/externalLinks"
import { openMcpViewLink } from "./mcpViewHost"

export const openInNewTab: typeof externalLinks.openInNewTab = (url) => void openMcpViewLink(url)
