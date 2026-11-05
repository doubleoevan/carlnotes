import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	TopicLinkedFinding as SharedTopicLinkedFinding,
	type TopicLinkedFindingDetailsProps,
} from "@carlnotes/core/components/TopicLinkedFinding"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { TopicResourceInfo } from "./TopicResourceInfo"

/**
 * Opens the same authorized Finding as the web's query link.
 */
export function TopicLinkedFinding({ topic }: { topic: TopicResponse }) {
	const { finding } = useLocalSearchParams<{ finding?: string }>()
	const router = useRouter()
	const state = useTopicFeed()
	return (
		<SharedTopicLinkedFinding
			topic={topic}
			findingId={finding}
			Details={FindingDetails}
			topicFeedHandlers={state.handlers}
			onClose={() => router.setParams({ finding: undefined })}
		/>
	)
}

// the existing sheet owns native dismissal and the feed supplies write handlers
function FindingDetails({ topic, resource, onClose, topicFeedHandlers }: TopicLinkedFindingDetailsProps) {
	return <TopicResourceInfo topic={topic} resource={resource} topicFeedHandlers={topicFeedHandlers} onClose={onClose} />
}
