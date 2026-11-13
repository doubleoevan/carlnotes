import type { TopicCard as TopicCardFields } from "@carlnotes/contracts/home"
import { TopicCard, type TopicCardElements } from "@carlnotes/core/components/TopicCard"
import { TOPIC_CARD_ELEMENTS } from "@/components/topic/TopicCard"
import { McpViewCardLink } from "./McpViewCardLink"
import { FINDINGS_ROUTE_PREFIX } from "./mcpViewHistory"
import { moveMcpViewOneHop } from "./mcpViewHop"
import { FINDINGS_FEED_TOOL } from "./useFindingPages"

/**
 * One Topic's card in an MCP view, whose press reads the Topic's findings and takes the one hop to them.
 */
export function McpViewTopicCard({ topic }: { topic: TopicCardFields }) {
	const handleOpenTopicFindings = (): void =>
		void moveMcpViewOneHop({
			toolName: FINDINGS_FEED_TOOL,
			toolArguments: { topic_id: topic.id },
			path: `${FINDINGS_ROUTE_PREFIX}${topic.id}`,
			href: topic.path,
		})
	return <TopicCard topic={topic} onOpen={handleOpenTopicFindings} elements={MCP_VIEW_TOPIC_CARD_ELEMENTS} />
}

// the web's elements of the card, with a name whose link opens the Topic in the MCP view
const MCP_VIEW_TOPIC_CARD_ELEMENTS: TopicCardElements = { ...TOPIC_CARD_ELEMENTS, Name: McpViewCardLink }
