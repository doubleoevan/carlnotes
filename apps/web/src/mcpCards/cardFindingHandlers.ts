// a card's finding handlers: each change to a finding calls its tool through the host, and is shown once it saves
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { FindingChange } from "@/components/search/searchFindingChanges"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { callCardTool } from "./cardHost"

/**
 * Returns the finding handlers of a card, each a tool call that reports its change once the tool saves it. Opening a
 * finding records nothing from a card, and a card marks a finding read but never unread.
 */
export function toCardFindingHandlers(onFindingChange: (findingChange: FindingChange) => void): TopicFeedHandlers {
	// save a change to one finding through its tool, then report it
	const saveFindingChange = async (
		findingId: string,
		toolCall: { toolName: string; toolArguments: Record<string, unknown> },
		topicFindingChange: Partial<TopicFinding>,
	): Promise<void> => {
		const toolResult = await callCardTool(toolCall.toolName, { finding_id: findingId, ...toolCall.toolArguments })
		if (!toolResult.isError) {
			onFindingChange({ findingId, topicFindingChange })
		}
	}
	return {
		openTopicFinding: () => {},
		consumeTopicFinding: (findingId, isConsumed) =>
			void (isConsumed
				? saveFindingChange(findingId, { toolName: "mark_finding_consumed", toolArguments: {} }, { isConsumed })
				: undefined),
		rateTopicFinding: (findingId, rating) =>
			void saveFindingChange(findingId, { toolName: "rate_finding", toolArguments: { rating } }, { rating }),
		bookmarkTopicFinding: (findingId, isBookmarked) =>
			void saveFindingChange(
				findingId,
				{ toolName: "bookmark_finding", toolArguments: { is_bookmarked: isBookmarked } },
				{ isBookmarked },
			),
	}
}
