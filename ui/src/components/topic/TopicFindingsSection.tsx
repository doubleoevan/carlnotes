import type { PodcastEpisode, TopicFinding } from "@shared/contracts"
import { NO_SCRIPT_ROW_LIMIT } from "@shared/seo"
import type * as React from "react"
import { useState } from "react"
import { TopicResource } from "@/components/topic/TopicResource"
import { RESOURCE_LIST_CARD_CLASS, SCRIPTED_HIDDEN_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { CollapsibleSection } from "./CollapsibleSection"
import { MoreButton } from "./MoreButton"

// how many topic finding rows show before the expander
const MAX_TOPIC_FINDINGS = 5

// the topic findings section props
type TopicFindingsSectionProps = {
	topicFindings: TopicFinding[]
	hasAnyFindings: boolean
	isRatable: boolean
	isBookmarkable: boolean
	topicFeedHandlers: TopicFeedHandlers
	// the topic that each note popover's copied Markdown names, with its visibility
	topic: React.ComponentProps<typeof TopicResource>["topic"]
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
	topicFeedHandlers,
	topic,
	newCountInfo,
	latestPodcastEpisode,
}: TopicFindingsSectionProps) {
	return (
		<CollapsibleSection value="findings" title="Topic findings" titleAside={newCountInfo} className="mt-2">
			<TopicFindingList
				topicFindings={topicFindings}
				shouldRenderHiddenRows
				isRatable={isRatable}
				isBookmarkable={isBookmarkable}
				topicFeedHandlers={topicFeedHandlers}
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

// a topic's findings, what the user may do with the findings, the text shown with no findings, whether the html
// holds rows for a reader without JavaScript, the page the expander links for one, and the classes of the list's
// card and of its expander
type TopicFindingListProps = Omit<React.ComponentProps<typeof TopicResource>, "resource" | "rank" | "className"> & {
	topicFindings: TopicFinding[]
	emptyText: string
	// whether the html holds up to NO_SCRIPT_ROW_LIMIT rows, with those past five hidden until expanded, and the page
	// the expander links without JavaScript
	shouldRenderHiddenRows?: boolean
	fullListHref?: string
	className?: string
	moreButtonClassName?: string
}

/**
 * A topic's findings as numbered rows, five until the expander shows every row. A bookmarked row takes no number.
 * If shouldRenderHiddenRows, a reader without JavaScript sees up to NO_SCRIPT_ROW_LIMIT rows and no expander.
 */
export function TopicFindingList({
	topicFindings,
	emptyText,
	shouldRenderHiddenRows = false,
	fullListHref,
	className,
	moreButtonClassName,
	...topicResourceProps
}: TopicFindingListProps) {
	// the rows rendered: every row if expanded, the first NO_SCRIPT_ROW_LIMIT rows if shouldRenderHiddenRows, or five
	const [isExpanded, setIsExpanded] = useState(false)
	const renderedRowLimit = shouldRenderHiddenRows ? NO_SCRIPT_ROW_LIMIT : MAX_TOPIC_FINDINGS
	const renderedTopicFindings = isExpanded ? topicFindings : topicFindings.slice(0, renderedRowLimit)
	const moreTopicFindingsCount = topicFindings.length - MAX_TOPIC_FINDINGS

	// how many of the rendered rows are bookmarked. a bookmarked row sorts first and takes no number
	const pinnedRenderedCount = renderedTopicFindings.filter((topicFinding) => topicFinding.isBookmarked).length
	return (
		<>
			{/* topic finding rows, each drawing its own dashed separator.
			    a row past five hides with JavaScript until expanded */}
			<div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1", className)}>
				{renderedTopicFindings.map((topicFinding, index) => (
					<TopicResource
						key={topicFinding.findingId}
						resource={topicFinding}
						rank={topicFinding.isBookmarked ? null : index - pinnedRenderedCount + 1}
						className={cn(!isExpanded && index >= MAX_TOPIC_FINDINGS && SCRIPTED_HIDDEN_CLASS)}
						{...topicResourceProps}
					/>
				))}
				{renderedTopicFindings.length === 0 && <p className="text-muted-foreground p-3 text-sm">{emptyText}</p>}
			</div>
			{/* the expander, which a reader without JavaScript sees as a link to the topic page on a homepage card */}
			{moreTopicFindingsCount > 0 && (
				<MoreButton
					isExpanded={isExpanded}
					moreLabel={`+ ${moreTopicFindingsCount} more `}
					fullListHref={fullListHref}
					onToggle={() => setIsExpanded(!isExpanded)}
					className={moreButtonClassName}
				/>
			)}
		</>
	)
}
