import type { PodcastEpisode, TopicFinding } from "@shared/contracts"
import type * as React from "react"
import { useState } from "react"
import { TopicResource } from "@/components/topic/TopicResource"
import { RESOURCE_LIST_CARD_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { CollapsibleSection } from "./CollapsibleSection"
import { MoreButton } from "./MoreButton"

// the max topic finding rows shown before the expander
const MAX_TOPIC_FINDINGS = 5

// the topic findings section props
type TopicFindingsSectionProps = {
	topicFindings: TopicFinding[]
	hasAnyFindings: boolean
	isRatable: boolean
	isBookmarkable: boolean
	handlers: TopicFeedHandlers
	// names the topic in each note popover's copied Markdown
	topic: { id: string; name: string; prompt: string }
	// the unread count for the title row, built by the page that has the whole topic
	newCountInfo?: React.ReactNode
	// the topic's latest podcast episode, whose chapters put a pill on the findings that they narrate
	latestPodcastEpisode?: PodcastEpisode | null
}

// the topic page's collapsible topic findings list
export function TopicFindingsSection({
	topicFindings,
	hasAnyFindings,
	isRatable,
	isBookmarkable,
	handlers,
	topic,
	newCountInfo,
	latestPodcastEpisode,
}: TopicFindingsSectionProps) {
	return (
		<CollapsibleSection value="findings" title="Topic findings" titleAside={newCountInfo} className="mt-2">
			<TopicFindingList
				topicFindings={topicFindings}
				isRatable={isRatable}
				isBookmarkable={isBookmarkable}
				resourceHandlers={handlers}
				topic={topic}
				latestPodcastEpisode={latestPodcastEpisode}
				emptyText={
					hasAnyFindings
						? "Nothing new worth your time yet. Carl has standards."
						: "Carl's getting started. The raccoon put a pot on..."
				}
			/>
		</CollapsibleSection>
	)
}

// a topic's findings, what the user may do with the findings, the text shown with no findings,
// and the classes of the list's card and of its expander
type TopicFindingListProps = Omit<React.ComponentProps<typeof TopicResource>, "resource" | "rank"> & {
	topicFindings: TopicFinding[]
	emptyText: string
	className?: string
	moreButtonClassName?: string
}

/**
 * A topic's findings as numbered rows, five until the expander shows every row. A bookmarked row takes no number.
 */
export function TopicFindingList({
	topicFindings,
	emptyText,
	className,
	moreButtonClassName,
	...topicResourceProps
}: TopicFindingListProps) {
	// limit the rows unless expanded
	const [isExpanded, setIsExpanded] = useState(false)
	const topicFindingsShown = isExpanded ? topicFindings : topicFindings.slice(0, MAX_TOPIC_FINDINGS)
	const moreTopicFindingsCount = topicFindings.length - MAX_TOPIC_FINDINGS

	// bookmarked rows sort first, so this count is how many of the rows shown are pinned instead of being numbered
	const pinnedShownCount = topicFindingsShown.filter((topicFinding) => topicFinding.isBookmarked).length
	return (
		<>
			{/* topic finding rows, each drawing its own dashed separator */}
			<div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1", className)}>
				{topicFindingsShown.map((topicFinding, index) => (
					<TopicResource
						key={topicFinding.findingId}
						resource={topicFinding}
						rank={topicFinding.isBookmarked ? null : index - pinnedShownCount + 1}
						{...topicResourceProps}
					/>
				))}
				{topicFindingsShown.length === 0 && <p className="text-muted-foreground p-3 text-sm">{emptyText}</p>}
			</div>
			{moreTopicFindingsCount > 0 && (
				<MoreButton
					isExpanded={isExpanded}
					moreLabel={`+ ${moreTopicFindingsCount} more `}
					onToggle={() => setIsExpanded(!isExpanded)}
					className={moreButtonClassName}
				/>
			)}
		</>
	)
}
