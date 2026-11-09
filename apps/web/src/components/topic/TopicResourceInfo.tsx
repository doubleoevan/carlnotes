// a topic finding's note popover, with the link out, the finding's reactions, the preview, Carl's notes, the topic
// with its byline, the user's buttons, the rating, its comment thread, and its flag

import type { Visibility } from "@carlnotes/contracts/enums"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toHostWithoutWww } from "@carlnotes/contracts/seo"
import type { TopicFeed } from "@carlnotes/contracts/topics"
import { useSubjectReportFlag } from "@carlnotes/core/hooks/useSubjectReport"
import { isFindingRatedDown } from "@carlnotes/core/lib/topicFindingFilters"
import { cn } from "@carlnotes/nightshift/classNames"
import { ExternalLink, Flag } from "lucide-react"
import type { ReactNode } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog"
import { FindingChapterPill } from "@/components/podcast/PodcastEpisodePill"
import { PopoverCloseButton, PopoverContent } from "@/components/primitives/popover"
import { ReactionRow } from "@/components/social/ReactionRow"
import { SocialSection } from "@/components/social/SocialSection"
import {
	ACTIVE_ICON_CLASS,
	METADATA_LINE_CLASS,
	POPOVER_HEADING_CLASS,
	POPOVER_PANEL_CLASS,
	STANDALONE_LINK_CLASS,
} from "@/lib/styleClasses"
import { captureVisitEvent, toPublicTopicProperties } from "@/lib/visitAnalytics"
import { type TopicFeedHandlers, useIsSignedIn } from "@/providers/TopicFeedProvider"
import { TOPIC_FINDING_TOGGLE_CLASS, TopicFindingControls } from "./TopicFindingControls"
import { TopicFindingDetails } from "./TopicFindingDetails"
import { ResourceMetadata } from "./TopicFindingSummary"

// the topic that the note popover names and links to, with its visibility, and the team or owner its byline names
// and the image its thumbnail shows where the caller has them
export type TopicResourceInfoTopic = Partial<Pick<TopicFeed, "owner" | "teamLink" | "image">> & {
	id: string
	name: string
	prompt: string
	visibility: Visibility
	// whether the user owns the topic
	isTopicOwner?: boolean
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
	const findingTarget = { kind: "finding", id: resource.findingId } as const

	// a link or a podcast episode chapter can still open a finding rated thumbs down, which has no reactions or comments
	const isSocialShown = !isFindingRatedDown(resource)

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
					reactionRow={
						isSocialShown && (
							<ReactionRow
								target={findingTarget}
								summary={resource.reactions}
								isSignedIn={isSignedIn}
								onSummaryChange={(reactions) =>
									topicFeedHandlers.keepTopicFindingReactions(resource.findingId, reactions)
								}
							/>
						)
					}
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

				{/* the link preview, Carl's notes, the topic with its byline, and the stats */}
				<TopicFindingDetails resource={resource} topic={topic} podcastEpisode={podcastEpisode} />
				{/* the bookmark, read, and rating buttons, only shown to a signed-in user */}
				{isSignedIn && (
					<TopicFindingControls
						resource={resource}
						isRatable={isRatable}
						isBookmarkable={isBookmarkable}
						topicFeedHandlers={topicFeedHandlers}
					/>
				)}

				{/* the finding's comments, which load as the popover opens */}
				{isSocialShown && (
					<div className="-mt-2">
						<SocialSection
							target={findingTarget}
							isSignedIn={isSignedIn}
							topicId={topic.id}
							isTopicOwner={topic.isTopicOwner ?? false}
						/>
					</div>
				)}

				{/* a signed-in user's flag of the finding itself */}
				{isSignedIn && (
					<FindingReportButton findingId={resource.findingId} subjectLabel={resource.title ?? resource.url} />
				)}
			</PopoverContent>
		</>
	)
}

// the finding's report button, which reads whether the user reported the finding as the popover opens
function FindingReportButton({ findingId, subjectLabel }: { findingId: string; subjectLabel: string }) {
	const reportFlag = useSubjectReportFlag({ subjectKind: "finding", subjectId: findingId })
	return (
		<>
			<button type="button" onClick={reportFlag.press} className={cn(TOPIC_FINDING_TOGGLE_CLASS, "-mt-2")}>
				<Flag className={cn("size-4", reportFlag.isReported && ACTIVE_ICON_CLASS)} />
				{reportFlag.label}
			</button>
			{reportFlag.isReporting && (
				<ReportIssueDialog
					subjectKind="finding"
					subjectId={findingId}
					subjectLabel={subjectLabel}
					onClose={reportFlag.closeReport}
				/>
			)}
		</>
	)
}

/**
 * A topic finding's heading in its note popover: the rank if it is not null, the title linked out to the page, the
 * metadata line under the title, and the reactions under that line.
 */
export function TopicFindingHeading({
	topicFindingRank,
	title,
	url,
	reactionRow,
	onClick,
	children,
}: {
	topicFindingRank: number | null
	title: string
	url: string
	reactionRow?: ReactNode
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
				{reactionRow}
			</div>
		</div>
	)
}
