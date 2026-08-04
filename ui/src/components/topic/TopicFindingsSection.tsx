import type { TopicFinding } from "@shared/contracts"
import { useState } from "react"
import { TopicResource } from "@/components/topic/TopicResource"
import { cn, RESOURCE_LIST_CARD_CLASS } from "@/lib/utils"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { CollapsibleSection } from "./CollapsibleSection"
import { MoreButton } from "./MoreButton"

// the max topic finding rows shown before the expander
const MAX_TOPIC_FINDINGS = 5

// the topic findings section props: the view-filtered rows, whether any exist at all, ratability, and the row handlers
type TopicFindingsSectionProps = {
	topicFindings: TopicFinding[]
	hasAnyFindings: boolean
	isRatable: boolean
	handlers: TopicFeedHandlers
}

// the collapsible topic findings list, capped at five rows with the homepage expander
export function TopicFindingsSection({
	topicFindings,
	hasAnyFindings,
	isRatable,
	handlers,
}: TopicFindingsSectionProps) {
	const [isExpanded, setIsExpanded] = useState(false)
	// cap the rows unless expanded
	const topicFindingsShown = isExpanded ? topicFindings : topicFindings.slice(0, MAX_TOPIC_FINDINGS)
	const moreTopicFindingsCount = topicFindings.length - MAX_TOPIC_FINDINGS
	// bookmarked rows sort first, so remove them from the numbering shown
	const pinnedShownCount = topicFindingsShown.filter((finding) => finding.isBookmarked).length
	return (
		<CollapsibleSection value="findings" title="Topic findings" className="mt-4">
			{/* topic finding rows, each drawing its own dashed separator */}
			<div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1")}>
				{topicFindingsShown.map((finding, index) => (
					<TopicResource
						key={finding.findingId}
						resource={finding}
						rank={finding.isBookmarked ? null : index - pinnedShownCount + 1}
						isRatable={isRatable}
						resourceHandlers={handlers}
					/>
				))}
				{topicFindingsShown.length === 0 && (
					<p className="text-muted-foreground p-3 text-sm">
						{hasAnyFindings
							? "Nothing new worth your time yet. Carl has standards."
							: "Carl's getting started. The raccoon put a pot on..."}
					</p>
				)}
			</div>
			{moreTopicFindingsCount > 0 && (
				<MoreButton
					isExpanded={isExpanded}
					moreLabel={`+ ${moreTopicFindingsCount} more `}
					onToggle={() => setIsExpanded(!isExpanded)}
				/>
			)}
		</CollapsibleSection>
	)
}
