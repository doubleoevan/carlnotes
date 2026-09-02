import type { ChatLinkPreview, TopicFinding } from "@shared/contracts"
import { Bookmark, Check, Circle, ExternalLink, ThumbsDown, ThumbsUp } from "lucide-react"
import type * as React from "react"
import { useEffect, useState } from "react"
import { fetchTopicFindingLinkPreview, sendFindingFeedback } from "@/clients/topicClient"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { LinkPreviewCard, LinkPreviewLoading } from "@/components/common/LinkPreviewCard"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import {
	Popover,
	PopoverAnchor,
	PopoverCloseButton,
	PopoverContent,
	PopoverTrigger,
} from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { InfoSection } from "@/components/topic/TopicInfo"
import { ScrollBox, toNotesMarkdown } from "@/components/topic/TopicScanRecap"
import { toAgeLabel } from "@/lib/labels"
import { POPOVER_HEADING_CLASS, POPOVER_PANEL_CLASS } from "@/lib/styleClasses"
import { cn, RESOURCE_KIND_ICON } from "@/lib/utils"
import { type TopicFeedHandlers, useIsSignedIn, useTopicFeedActions } from "@/providers/TopicFeedProvider"

// the row's topic finding and its rank among the topic's auto-kept findings, null if a bookmark pins it
type TopicResourceProps = {
	resource: TopicFinding
	rank: number | null
	isRatable: boolean
	isBookmarkable: boolean
	resourceHandlers?: TopicFeedHandlers
	// names the topic in the note popover's copied Markdown
	topic: { id: string; name: string; prompt: string }
}

/**
 * A single topic resource row. Clicking anywhere on the row opens the topic finding's note, which is where the
 * rank, the link out to the page, and Carl's words all live. Consumed rows appear muted, like an email inbox.
 */
export function TopicResource({
	resource,
	rank,
	isRatable,
	isBookmarkable,
	resourceHandlers,
	topic,
}: TopicResourceProps) {
	// the topic page passes handlers that reload their own payload. the homepage falls back to the shared provider's handlers
	const providerHandlers = useTopicFeedActions()
	const { openTopicFinding, consumeTopicFinding, rateTopicFinding, bookmarkTopicFinding } =
		resourceHandlers ?? providerHandlers
	// signed-out visitors don't get the per-user read and rating buttons
	const isSignedIn = useIsSignedIn()

	const ResourceIcon = RESOURCE_KIND_ICON[resource.resourceKind]
	// the whole row opens the note popup for the topic finding and hovering it shows the hint
	const [isNoteOpen, setIsNoteOpen] = useState(false)
	const handleNoteOpenChange = (isOpen: boolean): void => {
		setIsNoteOpen(isOpen)
	}
	const [isHintOpen, setIsHintOpen] = useState(false)
	// unread rows are bold and consumed rows go muted
	const titleClass = cn(
		"max-w-full truncate text-left text-sm group-hover:text-foreground",
		resource.isConsumed ? "text-muted-foreground font-normal" : "text-foreground font-semibold",
	)
	const metadataClass = cn(
		"mt-0.5 text-xs group-hover:text-foreground/80",
		resource.isConsumed ? "text-muted-foreground/70" : "text-muted-foreground",
	)
	// the bookmark mark's label and tooltip, shared so the two never drift apart
	const bookmarkLabel = resource.isBookmarked ? "Remove bookmark" : "Bookmark"
	// the hover highlight paints on a rounded under-layer, so the separator above the row stays straight
	return (
		<Popover open={isNoteOpen} onOpenChange={handleNoteOpenChange}>
			{/* the row is a pointer shortcut to the note. the title is the trigger that holds the semantics */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: reachable by keyboard through the title trigger */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut over children that have the semantics */}
			<div
				onClick={() => handleNoteOpenChange(true)}
				onMouseEnter={() => setIsHintOpen(true)}
				onMouseLeave={() => setIsHintOpen(false)}
				className="group after:border-separator-strong relative isolate flex cursor-pointer before:absolute before:inset-0 before:-z-10 before:rounded-lg before:transition-colors after:absolute after:inset-x-2 after:top-0 after:border-t after:border-dashed first:after:hidden hover:before:bg-accent-foreground/20"
			>
				{/* the rank, in the slot the bookmark mark takes over once the finding is bookmarked */}
				{rank !== null && (
					<span
						className="text-muted-foreground absolute top-1.5 left-0 grid size-11 place-items-center sm:size-8"
						aria-hidden="true"
					>
						<span className="font-display text-sm tabular-nums">{rank}</span>
					</span>
				)}
				{/* the filled bookmark mark, sitting where the rank would be. it only shows on a bookmarked row.
				    it stops the click so removing a bookmark never also opens the note */}
				{isSignedIn && resource.isBookmarked && (
					<Tooltip>
						<TooltipTrigger
							onClick={(event) => {
								event.stopPropagation()
								bookmarkTopicFinding(resource.findingId, false)
							}}
							aria-pressed={true}
							aria-label={bookmarkLabel}
							className="text-primary absolute top-1.5 left-0 grid size-11 place-items-center sm:size-8"
						>
							<Bookmark className="size-3.75 fill-current" strokeWidth={2.5} />
						</TooltipTrigger>
						<TooltipContent>{bookmarkLabel}</TooltipContent>
					</Tooltip>
				)}
				<div
					// the left padding clears the rank slot, and the right one is the row's own inset
					className="flex min-w-0 flex-1 items-start gap-2.5 py-3 pr-3 pl-9"
				>
					<ResourceIcon
						className={cn(
							"mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground",
							resource.isConsumed && "opacity-60",
						)}
						aria-label={resource.resourceKind}
					/>
					<div className="min-w-0 flex-1">
						{/* the title opens the note, and is what a keyboard user tabs to for it */}
						<div className="truncate">
							<PopoverTrigger onClick={(event) => event.stopPropagation()} className={titleClass}>
								{resource.title ?? resource.url}
							</PopoverTrigger>
						</div>
						<div className={cn(metadataClass, "flex items-center gap-1.5")}>
							{[resource.source, toAgeLabel(resource.publishedAt)].filter(Boolean).join(" · ")}
							{/* the teammates who kept this finding */}
							{resource.teamBookmarks.length > 0 && (
								<span className="flex items-center gap-0.5">
									{resource.teamBookmarks.map((saver) => (
										<Tooltip key={saver.userId}>
											<TooltipTrigger asChild>
												<span>
													<UserAvatar
														userId={saver.userId}
														username={saver.username}
														avatarSource={saver.avatarSource}
														className="size-4"
													/>
												</span>
											</TooltipTrigger>
											<TooltipContent>{`${saver.username} kept this`}</TooltipContent>
										</Tooltip>
									))}
								</span>
							)}
						</div>
					</div>
				</div>
				{/* the note and its hint both anchor here, off the row's right edge */}
				<Tooltip open={isHintOpen && !isNoteOpen} onOpenChange={setIsHintOpen}>
					<TooltipTrigger asChild>
						<PopoverAnchor className="pointer-events-none absolute top-1.5 right-1 size-11 sm:size-8" />
					</TooltipTrigger>
					<TooltipContent side="top">A topic finding note from Carl</TooltipContent>
				</Tooltip>

				{/* the note itself, holding the rank, the link out, and Carl's words */}
				<ResourceInfo
					resource={resource}
					topicFindingRank={rank}
					topic={topic}
					isRatable={isRatable}
					isBookmarkable={isBookmarkable}
					topicHandlers={{ consumeTopicFinding, rateTopicFinding, bookmarkTopicFinding, openTopicFinding }}
				/>
			</div>
		</Popover>
	)
}

// the resource info popover
function ResourceInfo({
	resource,
	topicFindingRank,
	topic,
	isRatable,
	isBookmarkable,
	topicHandlers,
}: {
	topic: TopicResourceProps["topic"]
	resource: TopicFinding
	// the finding's rank among the topic's auto-kept findings, null if a bookmark pins it
	topicFindingRank: number | null
	isRatable: boolean
	isBookmarkable: boolean
	// the feed handlers the row resolved, the page's or the shared provider's
	topicHandlers: TopicFeedHandlers
}) {
	// signed-out visitors don't get the per-user read and rating buttons
	const isSignedIn = useIsSignedIn()
	// the linked page's link preview card, fetched when the row mounts for every visitor
	const [linkPreview, setLinkPreview] = useState<ChatLinkPreview | null>(null)
	const [isLinkPreviewLoading, setIsLinkPreviewLoading] = useState(true)
	useEffect(() => {
		// a row that unmounts mid-fetch must not set state afterward
		let isTopicFindingOpen = true
		fetchTopicFindingLinkPreview(resource.findingId)
			.then((findingLinkPreview) => isTopicFindingOpen && setLinkPreview(findingLinkPreview))
			.catch(() => {})
			.finally(() => isTopicFindingOpen && setIsLinkPreviewLoading(false))
		return () => {
			isTopicFindingOpen = false
		}
	}, [resource.findingId])

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
				<div className="mb-3 flex items-start gap-2.5">
					{topicFindingRank !== null && (
						<span className="text-muted-foreground font-display shrink-0 text-sm tabular-nums">
							<span className="sr-only">Rank </span>
							{topicFindingRank}
						</span>
					)}
					<div className="min-w-0 flex-1">
						<AnchorLink
							href={resource.url}
							onClick={() => topicHandlers.openTopicFinding(resource.findingId)}
							className="text-link inline-flex items-start gap-1 text-sm font-semibold hover:underline"
						>
							{resource.title ?? resource.url}
							<ExternalLink className="mt-0.5 size-3.5 shrink-0" />
						</AnchorLink>
						<div className="text-muted-foreground mt-0.5 text-xs">
							{[resource.source, toAgeLabel(resource.publishedAt)].filter(Boolean).join(" · ")}
						</div>
					</div>
				</div>

				{/* the linked page's link preview card, right above Carl's notes */}
				{isLinkPreviewLoading && <LinkPreviewLoading />}
				{linkPreview && (
					<div className="mb-3">
						<LinkPreviewCard linkPreview={linkPreview} className="max-w-full" />
					</div>
				)}

				{/* the AI explanation of why this resource is relevant, in a scroll box so a long note stays contained */}
				<div className="text-muted-foreground font-display mb-1 text-xs tracking-wide uppercase">{"Carl's notes"}</div>
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
				<div className="mt-3 space-y-2">
					<InfoSection className="py-0" label="Fetched">
						{new Date(resource.fetchedAt).toLocaleDateString()}
					</InfoSection>
					<div className="bg-separator h-px" />
					<InfoSection className="py-0" label="Views">
						{resource.viewCount.toLocaleString()}
					</InfoSection>
				</div>
				{/* the bookmark, read, and rating buttons, only shown to a signed-in user */}
				{isSignedIn && (
					<div className="mt-3 border-t pt-2">
						{/* the rating block leads, shown only on topics this user owns or subscribes to */}
						{isRatable && (
							<TopicFindingRating
								findingId={resource.findingId}
								rating={resource.rating}
								onRateTopicFinding={(rating) => topicHandlers.rateTopicFinding(resource.findingId, rating)}
							/>
						)}
						{/* the bookmark and read toggles share one row, and a user who cannot bookmark gets the read toggle alone */}
						<div className={cn("flex items-center justify-between gap-2", isRatable && "mt-2")}>
							{isBookmarkShown && (
								<button
									type="button"
									onClick={() => topicHandlers.bookmarkTopicFinding(resource.findingId, !resource.isBookmarked)}
									aria-pressed={resource.isBookmarked}
									className="hover:text-primary flex min-h-11 items-center gap-2 text-sm hover:underline sm:min-h-9"
								>
									<Bookmark className={cn("size-4", resource.isBookmarked && "text-primary fill-current")} />
									{bookmarkLabel}
								</button>
							)}
							<button
								type="button"
								onClick={() => topicHandlers.consumeTopicFinding(resource.findingId, !resource.isConsumed)}
								className="hover:text-primary flex min-h-11 items-center gap-2 text-sm hover:underline sm:min-h-9"
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

// a thumbs up or down toggle for the rating row
type RateTopicFindingButtonProps = { isActive: boolean; label: string; onClick: () => void; children: React.ReactNode }

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

	// a thumb click toggles the rating and sends the box's words with it when there are any
	const handleRateTopicFinding = async (thumb: "up" | "down"): Promise<void> => {
		onRateTopicFinding(rating === thumb ? null : thumb)
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
			<span className="text-muted-foreground font-display text-xs tracking-wide uppercase">Rate this finding</span>
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
				<RateTopicFindingButton
					isActive={rating === "up"}
					label="Thumbs up"
					onClick={() => void handleRateTopicFinding("up")}
				>
					<ThumbsUp className="size-4" />
				</RateTopicFindingButton>
				<RateTopicFindingButton
					isActive={rating === "down"}
					label="Thumbs down"
					onClick={() => void handleRateTopicFinding("down")}
				>
					<ThumbsDown className="size-4" />
				</RateTopicFindingButton>
			</div>
		</div>
	)
}

function RateTopicFindingButton({ isActive, label, onClick, children }: RateTopicFindingButtonProps) {
	return (
		<Button
			type="button"
			variant={isActive ? "default" : "outline"}
			size="icon"
			aria-label={label}
			aria-pressed={isActive}
			onClick={onClick}
			className="size-11 sm:size-9"
		>
			{children}
		</Button>
	)
}
