import type { MouseEvent, ReactNode } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { FINDINGS_ROUTE_PREFIX, mcpViewHistory } from "./mcpViewHistory"
import { moveMcpViewOneHop } from "./mcpViewHop"
import { toMcpViewSiteUrl } from "./mcpViewHost"
import { FINDINGS_FEED_TOOL } from "./useFindingPages"

/**
 * A link to a Topic. From the route an MCP view opened on, it reads the Topic's findings and moves to them, and past that
 * one hop it opens the Topic's page on the site. A Topic the tool will not read opens on the site too.
 */
export function McpViewLink({
	topicId,
	href,
	className,
	children,
}: {
	topicId: string
	href: string
	className?: string
	children: ReactNode
}) {
	if (mcpViewHistory.canGoBack()) {
		return (
			<AnchorLink href={href} className={className}>
				{children}
			</AnchorLink>
		)
	}

	// read the Topic's findings through the host, and open its page if that fails
	const absoluteUrl = toMcpViewSiteUrl(href)
	const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
		event.preventDefault()
		void moveMcpViewOneHop({
			toolName: FINDINGS_FEED_TOOL,
			toolArguments: { topic_id: topicId },
			path: `${FINDINGS_ROUTE_PREFIX}${topicId}`,
			href,
		})
	}
	return (
		<a href={absoluteUrl} className={className} onClick={handleClick}>
			{children}
		</a>
	)
}
