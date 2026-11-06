import type { MouseEvent, ReactNode } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { FINDINGS_ROUTE_PREFIX, mcpViewHistory, navigateMcpView } from "./mcpViewHistory"
import { callMcpViewTool, openMcpViewLink, toMcpViewSiteUrl } from "./mcpViewHost"
import { FINDINGS_FEED_TOOL } from "./useFindingPages"

// the newest Topic read, so that a slower read never replaces the destination of a later click
let latestTopicReadId = 0

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
	const moveToTopicFindings = async (): Promise<void> => {
		latestTopicReadId += 1
		const topicReadId = latestTopicReadId
		const toolArguments = { topic_id: topicId }
		const toolResult = await callMcpViewTool(FINDINGS_FEED_TOOL, toolArguments).catch(() => null)
		if (topicReadId !== latestTopicReadId) {
			return
		}
		if (!toolResult || toolResult.isError) {
			await openMcpViewLink(absoluteUrl)
			return
		}
		navigateMcpView(`${FINDINGS_ROUTE_PREFIX}${topicId}`, { toolResult, toolArguments })
	}
	const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
		event.preventDefault()
		void moveToTopicFindings()
	}
	return (
		<a href={absoluteUrl} className={className} onClick={handleClick}>
			{children}
		</a>
	)
}
