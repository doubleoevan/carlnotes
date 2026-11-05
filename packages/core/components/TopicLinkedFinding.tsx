import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { TopicDetails } from "@carlnotes/contracts/topics"
import type { ComponentType } from "react"
import type { TopicFeedHandlers } from "../hooks/useTopicFindingActions"

export type TopicLinkedFindingDetailsProps = {
	topic: TopicDetails
	resource: TopicFinding
	onClose: () => void
	topicFeedHandlers: TopicFeedHandlers
}
type TopicLinkedFindingProps = {
	topic: TopicDetails
	findingId: unknown
	Details: ComponentType<TopicLinkedFindingDetailsProps>
	onClose: () => void
	topicFeedHandlers: TopicFeedHandlers
}

/**
 * Resolves a linked Finding only from the current authorized Topic payload.
 */
export function TopicLinkedFinding({ topic, findingId, Details, onClose, topicFeedHandlers }: TopicLinkedFindingProps) {
	// lookup ignores feed filters and pagination without granting access to other Topics
	const resource =
		typeof findingId === "string" ? topic.findings.find((finding) => finding.findingId === findingId) : null
	return resource ? (
		<Details
			key={resource.findingId}
			topic={topic}
			resource={resource}
			onClose={onClose}
			topicFeedHandlers={topicFeedHandlers}
		/>
	) : null
}
