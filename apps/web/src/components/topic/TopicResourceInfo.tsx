// a topic finding's note popover, with the link out, the preview, Carl's notes, the user's buttons, and the rating

import type { Visibility } from "@carlnotes/contracts/enums"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toHostWithoutWww } from "@carlnotes/contracts/seo"
import { cn } from "@carlnotes/nightshift/classNames"
import { ExternalLink } from "lucide-react"
import type { ReactNode } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { FindingChapterPill } from "@/components/podcast/PodcastEpisodePill"
import { PopoverCloseButton, PopoverContent } from "@/components/primitives/popover"
import {
	METADATA_LINE_CLASS,
	POPOVER_HEADING_CLASS,
	POPOVER_PANEL_CLASS,
	STANDALONE_LINK_CLASS,
} from "@/lib/styleClasses"
import { captureVisitEvent, toPublicTopicProperties } from "@/lib/visitAnalytics"
import { type TopicFeedHandlers, useIsSignedIn } from "@/providers/TopicFeedProvider"
import { TopicFindingControls } from "./TopicFindingControls"
import { TopicFindingDetails } from "./TopicFindingDetails"
import { ResourceMetadata } from "./TopicFindingSummary"

// the topic that the note popover's copied Markdown names, with its visibility
export type TopicResourceInfoTopic = {
	id: string
	name: string
	prompt: string
	visibility: Visibility
}

/**
 * The topic finding's note popover, with the link out, the link preview, Carl's notes, and the user's buttons.
 */
export function TopicResourceInfo({
	resource,
	topicFindingRank,
	podcastEpisode,
	topic,
	isRatable,
	isBookmarkable,
	topicFeedHandlers,
}: {
	topic: TopicResourceInfoTopic
	resource: TopicFinding
	// the finding's rank among the topic's auto-kept findings, null if a bookmark pins it
	topicFindingRank: number | null
	// the podcast episode whose chapters put a pill on the findings that the chapters narrate
	podcastEpisode?: PodcastEpisode | null
	isRatable: boolean
	isBookmarkable: boolean
	// the feed handlers the row resolved, the page's or the shared provider's
	topicFeedHandlers: TopicFeedHandlers
}) {
	// signed-out visitors don't get the per-user read and rating buttons
	const isSignedIn = useIsSignedIn()

	// the row owns the popover's open state and anchors it, so this holds only the content
	return (
		<>
			{/* the content renders through a portal, but a react event bubbles the react tree instead of the dom one,
			    so the click is stopped here instead of reaching the row */}
			<PopoverContent onClick={(event) => event.stopPropagation()} align="end" className={POPOVER_PANEL_CLASS}>
				<PopoverCloseButton />
				<h2 className={POPOVER_HEADING_CLASS}>Topic Finding</h2>

				{/* the topic finding's rank and its title, which is the one way out to the page itself */}
				<TopicFindingHeading
					topicFindingRank={topicFindingRank}
					title={resource.title ?? resource.url}
					url={resource.url}
					onClick={() => {
						// report the click by the finding's host, naming the topic only if it is public
						captureVisitEvent("visit_finding_clicked", {
							host: toHostWithoutWww(resource.url),
							...toPublicTopicProperties(topic),
						})
						topicFeedHandlers.openTopicFinding(resource.findingId)
					}}
				>
					<ResourceMetadata resource={resource} />
					<FindingChapterPill podcastEpisode={podcastEpisode} findingId={resource.findingId} />
				</TopicFindingHeading>

				{/* the link preview, Carl's notes, and the stats */}
				<TopicFindingDetails resource={resource} topic={topic} />
				{/* the bookmark, read, and rating buttons, only shown to a signed-in user */}
				{isSignedIn && (
					<TopicFindingControls
						resource={resource}
						isRatable={isRatable}
						isBookmarkable={isBookmarkable}
						topicFeedHandlers={topicFeedHandlers}
					/>
				)}
			</PopoverContent>
		</>
	)
}

/**
 * A topic finding's heading in its note popover: the rank if it is not null, the title linked out to the page, and the
 * metadata line under the title.
 */
export function TopicFindingHeading({
	topicFindingRank,
	title,
	url,
	onClick,
	children,
}: {
	topicFindingRank: number | null
	title: string
	url: string
	onClick?: () => void
	// the metadata line under the title
	children: ReactNode
}) {
	return (
		<div className="mb-3 flex items-start gap-2.5">
			{topicFindingRank !== null && (
				<span className="text-muted-foreground font-display shrink-0 text-sm tabular-nums">
					<span className="sr-only">Rank </span>
					{topicFindingRank}
				</span>
			)}
			<div className="min-w-0 flex-1">
				<AnchorLink
					href={url}
					isUserContent
					onClick={onClick}
					className={cn(STANDALONE_LINK_CLASS, "inline-flex items-start gap-1 text-sm font-semibold")}
				>
					{title}
					<ExternalLink className="mt-0.5 size-3.5 shrink-0" />
				</AnchorLink>
				<div className={METADATA_LINE_CLASS}>{children}</div>
			</div>
		</div>
	)
}
