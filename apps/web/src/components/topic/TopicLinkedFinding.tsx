import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	TopicLinkedFinding as SharedTopicLinkedFinding,
	type TopicLinkedFindingDetailsProps,
} from "@carlnotes/core/components/TopicLinkedFinding"
import { useNavigate } from "@tanstack/react-router"
import { Popover, PopoverAnchor } from "@/components/primitives/popover"
import { useSearchParams } from "@/hooks/useSearchParams"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { TopicResourceInfo } from "./TopicResourceInfo"

/**
 * Opens the linked Finding even when the feed has hidden or paged past its row.
 */
export function TopicLinkedFinding({
	topic,
	topicFeedHandlers,
}: {
	topic: TopicResponse
	topicFeedHandlers: TopicFeedHandlers
}) {
	const findingId = useSearchParams().get("finding")
	const navigate = useNavigate()
	const handleClose = (): void => {
		void navigate({
			to: ".",
			search: (search: Record<string, unknown>) => {
				const { finding: _finding, ...remaining } = search
				return remaining
			},
			replace: true,
		})
	}
	return (
		<SharedTopicLinkedFinding
			topic={topic}
			findingId={findingId}
			Details={FindingDetails}
			topicFeedHandlers={topicFeedHandlers}
			onClose={handleClose}
		/>
	)
}

// reuse the existing Finding note and action handlers in a centered popover
function FindingDetails({ topic, resource, onClose, topicFeedHandlers }: TopicLinkedFindingDetailsProps) {
	return (
		<Popover
			open
			onOpenChange={(isOpen) => {
				if (!isOpen) {
					onClose()
				}
			}}
			modal
		>
			{/* the route supplies an anchor independently of filtered feed rows */}
			<PopoverAnchor className="pointer-events-none fixed top-1/3 left-1/2" />
			<TopicResourceInfo
				resource={resource}
				topic={topic}
				topicFindingRank={null}
				isRatable={topic.canRate}
				isBookmarkable={topic.isTopicOwner || topic.isTeamMember}
				topicFeedHandlers={topicFeedHandlers}
			/>
		</Popover>
	)
}
