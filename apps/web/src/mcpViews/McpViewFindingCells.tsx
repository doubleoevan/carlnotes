import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { FindingSearchTopic } from "@carlnotes/contracts/search"
import { cn } from "@carlnotes/nightshift/classNames"
import { ChevronDown } from "lucide-react"
import type { ReactNode } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { FindingChapterPill } from "@/components/podcast/PodcastEpisodePill"
import { Button } from "@/components/primitives/button"
import { TopicFindingControls } from "@/components/topic/TopicFindingControls"
import { TopicFindingDetails } from "@/components/topic/TopicFindingDetails"
import { toTopicFindingTitleClass } from "@/components/topic/TopicFindingSummary"
import { METADATA_LINE_CLASS } from "@/lib/styleClasses"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { McpViewReactionRow } from "./McpViewReactionRow"
import { useMcpViewData } from "./mcpViewHost"

/**
 * A finding's title as a link only, with the pill of the chapter that narrates it, and whatever line goes under it.
 */
export function McpViewFindingTitle({
	topicFinding,
	podcastEpisode,
	children,
}: {
	topicFinding: TopicFinding
	podcastEpisode?: PodcastEpisode | null
	children?: ReactNode
}) {
	return (
		<div className="min-w-0">
			<AnchorLink
				href={topicFinding.url}
				isUserContent
				className={cn("text-sm hover:underline", toTopicFindingTitleClass(topicFinding.isConsumed))}
			>
				{topicFinding.title ?? topicFinding.url}
			</AnchorLink>
			<div className={cn(METADATA_LINE_CLASS, "empty:hidden")}>
				{children}
				<FindingChapterPill podcastEpisode={podcastEpisode} findingId={topicFinding.findingId} />
			</div>
		</div>
	)
}

/**
 * The control that expands a finding's row.
 */
export function McpViewFindingExpandButton({
	isExpanded,
	onToggleExpanded,
}: {
	isExpanded: boolean
	onToggleExpanded: () => void
}) {
	return (
		<div className="flex justify-end">
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label={isExpanded ? "Hide Carl's notes" : "Show Carl's notes"}
				aria-expanded={isExpanded}
				onClick={onToggleExpanded}
				className="size-11 shrink-0 sm:size-9"
			>
				<ChevronDown className={cn("size-4 transition-transform", isExpanded && "rotate-180")} />
			</Button>
		</div>
	)
}

/**
 * A finding's expanded row: Carl's notes, the sender's private annotation, a user's rating, bookmark, and read
 * toggles, as in the note popover, and the finding's reactions.
 */
export function McpViewFindingDetails({
	topicFinding,
	topic,
	topicFeedHandlers,
}: {
	topicFinding: TopicFinding
	topic: FindingSearchTopic
	topicFeedHandlers: TopicFeedHandlers
}) {
	const { session, personalAnnotations } = useMcpViewData()
	return (
		<div className="min-w-0">
			<TopicFindingDetails
				resource={topicFinding}
				topic={topic}
				personalAnnotation={personalAnnotations?.[topicFinding.findingId]}
			/>
			{session && (
				<TopicFindingControls
					resource={topicFinding}
					isRatable={topic.canRate}
					isBookmarkable={topic.canBookmark}
					canMarkUnread={false}
					topicFeedHandlers={topicFeedHandlers}
				/>
			)}
			{/* the finding's reactions, in a view whose tool result came with them */}
			{topicFinding.reactions && (
				<McpViewReactionRow
					target={{ kind: "finding", id: topicFinding.findingId }}
					summary={topicFinding.reactions}
					isSignedIn={Boolean(session)}
				/>
			)}
		</div>
	)
}
