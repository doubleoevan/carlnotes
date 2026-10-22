// a topic finding's note popover, with the link out, the preview, Carl's notes, the user's buttons, and the rating

import { fetchTopicFindingLinkPreview, sendFindingFeedback } from "@carlnotes/client/topicClient"
import type { ChatLinkPreview } from "@carlnotes/contracts/chat"
import type { visibilities } from "@carlnotes/contracts/enums"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toHostWithoutWww } from "@carlnotes/contracts/seo"
import { Bookmark, Check, Circle, ExternalLink } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { LinkPreviewCard, LinkPreviewLoading } from "@/components/common/LinkPreviewCard"
import { RatingThumbs } from "@/components/common/RatingThumbs"
import { FindingChapterPill } from "@/components/podcast/PodcastEpisodePill"
import { Input } from "@/components/primitives/input"
import { PopoverCloseButton, PopoverContent } from "@/components/primitives/popover"
import {
	POPOVER_HEADING_CLASS,
	POPOVER_PANEL_CLASS,
	SECTION_LABEL_CLASS,
	STANDALONE_LINK_CLASS,
} from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { captureVisitEvent, toPublicTopicProperties } from "@/lib/visitAnalytics"
import { type TopicFeedHandlers, useIsSignedIn } from "@/providers/TopicFeedProvider"
import { ResourceMetadata } from "./TopicFindingSummary"
import { InfoSection } from "./TopicInfo"
import { ScrollBox, toNotesMarkdown } from "./TopicScanRecap"

// the bookmark and read toggles' text-button style
const TOPIC_FINDING_TOGGLE_CLASS = "hover:text-link flex min-h-11 items-center gap-2 text-sm hover:underline sm:min-h-9"

// the topic that the note popover's copied Markdown names, with its visibility
export type ResourceInfoTopic = { id: string; name: string; prompt: string; visibility: (typeof visibilities)[number] }

/**
 * The topic finding's note popover, with the link out, the link preview, Carl's notes, and the user's buttons.
 */
export function ResourceInfo({
	resource,
	topicFindingRank,
	podcastEpisode,
	topic,
	isRatable,
	isBookmarkable,
	topicFeedHandlers,
}: {
	topic: ResourceInfoTopic
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

	// the bookmark button's label, flipping with the finding's bookmark state
	const bookmarkLabel = resource.isBookmarked ? "Remove bookmark" : "Bookmark"
	// only a topic's owner bookmarks its findings, and an existing bookmark stays removable
	const isBookmarkShown = isBookmarkable || resource.isBookmarked
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

				{/* the linked page's link preview card, right above Carl's notes */}
				<FindingLinkPreview findingId={resource.findingId} />

				{/* the AI explanation of why this resource is relevant, in a scroll box so a long note stays contained */}
				<div className={cn(SECTION_LABEL_CLASS, "mb-1")}>{"Carl's notes"}</div>
				<ScrollBox
					copyMarkdown={toNotesMarkdown({
						topicId: topic.id,
						topicName: topic.name,
						prompt: topic.prompt,
						note: `[${resource.title ?? resource.url}](${resource.url})\n\n${resource.relevanceExplanation}`,
					})}
				>
					<p>{resource.relevanceExplanation || "No notes yet."}</p>
				</ScrollBox>
				{/* when the resource was fetched and how many times it was opened */}
				<TopicFindingStats fetchedAt={resource.fetchedAt} viewCount={resource.viewCount} />
				{/* the bookmark, read, and rating buttons, only shown to a signed-in user */}
				{isSignedIn && (
					<div className="mt-3 border-t pt-2">
						{/* the rating block leads, shown only on topics this user owns or subscribes to */}
						{isRatable && (
							<TopicFindingRating
								findingId={resource.findingId}
								rating={resource.rating}
								onRateTopicFinding={(rating) => topicFeedHandlers.rateTopicFinding(resource.findingId, rating)}
							/>
						)}
						{/* the bookmark and read toggles share one row, and a user who cannot bookmark gets the read toggle alone */}
						<div className={cn("flex items-center justify-between gap-2", isRatable && "mt-2")}>
							{isBookmarkShown && (
								<button
									type="button"
									onClick={() => topicFeedHandlers.bookmarkTopicFinding(resource.findingId, !resource.isBookmarked)}
									aria-pressed={resource.isBookmarked}
									className={TOPIC_FINDING_TOGGLE_CLASS}
								>
									<Bookmark className={cn("size-4", resource.isBookmarked && "text-primary fill-current")} />
									{bookmarkLabel}
								</button>
							)}
							<button
								type="button"
								onClick={() => topicFeedHandlers.consumeTopicFinding(resource.findingId, !resource.isConsumed)}
								className={TOPIC_FINDING_TOGGLE_CLASS}
							>
								{resource.isConsumed ? <Circle className="size-4" /> : <Check className="size-4" />}
								{resource.isConsumed ? "Mark unread" : "Mark read"}
							</button>
						</div>
					</div>
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
				<div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">{children}</div>
			</div>
		</div>
	)
}

/**
 * A topic finding's stats in its note popover: the day it was fetched, a divider, and how many times it was opened.
 */
export function TopicFindingStats({ fetchedAt, viewCount }: { fetchedAt: string; viewCount: number }) {
	return (
		<div className="mt-3 space-y-2">
			<InfoSection className="py-0" label="Fetched">
				{new Date(fetchedAt).toLocaleDateString()}
			</InfoSection>
			<div className="bg-separator h-px" />
			<InfoSection className="py-0" label="Views">
				{viewCount.toLocaleString()}
			</InfoSection>
		</div>
	)
}

// the linked page's link preview card, fetched for every visitor when the note popover opens
function FindingLinkPreview({ findingId }: { findingId: string }) {
	// the fetched preview, and whether its fetch is still in progress
	const [linkPreview, setLinkPreview] = useState<ChatLinkPreview | null>(null)
	const [isLinkPreviewLoading, setIsLinkPreviewLoading] = useState(true)
	useEffect(() => {
		// a popover that closes mid-fetch must not set state afterward
		let isTopicFindingOpen = true
		fetchTopicFindingLinkPreview(findingId)
			.then((findingLinkPreview) => isTopicFindingOpen && setLinkPreview(findingLinkPreview))
			.catch(() => {})
			.finally(() => isTopicFindingOpen && setIsLinkPreviewLoading(false))
		return () => {
			isTopicFindingOpen = false
		}
	}, [findingId])

	// the loading card until the fetch settles, then the card if the page offers one
	if (isLinkPreviewLoading) {
		return <LinkPreviewLoading />
	}
	if (!linkPreview) {
		return null
	}
	return (
		<div className="mb-3">
			<LinkPreviewCard linkPreview={linkPreview} className="max-w-full" isUserContent />
		</div>
	)
}

/**
 * The rating block: the thumbs set the rating, and a click also sends whatever words sit in the box.
 * The words are stored as written and never fed to scoring.
 */
function TopicFindingRating({
	findingId,
	rating,
	onRateTopicFinding,
}: {
	findingId: string
	rating: "up" | "down" | null
	onRateTopicFinding: (rating: "up" | "down" | null) => void
}) {
	const [topicFindingFeedback, setTopicFindingFeedback] = useState("")
	const [isTopicFindingRatingSent, setIsTopicFindingRatingSent] = useState(false)
	const [isSendingTopicFindingRating, setIsSendingTopicFindingRating] = useState(false)

	// a thumb click sets or clears the rating and sends the box's words with the rating if there are any
	const handleRateTopicFinding = async (nextRating: "up" | "down" | null): Promise<void> => {
		onRateTopicFinding(nextRating)
		if (!topicFindingFeedback.trim() || isSendingTopicFindingRating) {
			return
		}
		setIsSendingTopicFindingRating(true)
		try {
			await sendFindingFeedback(findingId, topicFindingFeedback.trim())
			setIsTopicFindingRatingSent(true)
		} catch (error) {
			// the words stay in the input, so the next thumb click can retry the send
			console.error("finding feedback send failed", error)
		} finally {
			setIsSendingTopicFindingRating(false)
		}
	}

	return (
		<div>
			<span className={SECTION_LABEL_CLASS}>Rate this finding</span>
			{/* the words sit beside the thumbs that send them, and one line of thanks replaces them once sent */}
			<div className="mt-2 flex items-center gap-2">
				{isTopicFindingRatingSent ? (
					<p className="text-muted-foreground flex-1 text-xs">Noted. Carl reads these later.</p>
				) : (
					<Input
						aria-label="Feedback for Carl"
						placeholder="Tell Carl why this finding was good or bad…"
						value={topicFindingFeedback}
						onChange={(event) => setTopicFindingFeedback(event.target.value)}
						className="h-8 flex-1 text-xs"
					/>
				)}
				<RatingThumbs rating={rating} onRate={(nextRating) => void handleRateTopicFinding(nextRating)} />
			</div>
		</div>
	)
}
