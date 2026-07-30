import type { TopicFinding } from "@shared/contracts"
import { Bookmark, Check, Circle, SquarePen, ThumbsDown, ThumbsUp } from "lucide-react"
import type * as React from "react"
import { AnchorLink } from "@/components/layout/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { InfoSection } from "@/components/topic/TopicInfo"
import { ScrollBox } from "@/components/topic/TopicScanRecap"
import { cn, POPOVER_HEADING_CLASS, RESOURCE_KIND_ICON, toAgeLabel } from "@/lib/utils"
import { type TopicFeedHandlers, useIsSignedIn, useTopicFeedActions } from "@/providers/TopicFeedProvider"

// the row's topic finding, its rank among the topic's auto-kept findings (null when a bookmark pins it instead),
// whether this user may rate it, and optional handlers that override the topic feed provider's handlers
type TopicResourceProps = {
	resource: TopicFinding
	rank: number | null
	isRatable: boolean
	resourceHandlers?: TopicFeedHandlers
}

/**
 * A single topic resource row. Clicking it opens the resource and marks the topic finding consumed.
 * Consumed rows appear muted, like an email inbox.
 */
export function TopicResource({ resource, rank, isRatable, resourceHandlers }: TopicResourceProps) {
	// the topic page passes handlers that reload its own payload. the homepage falls back to the shared provider's handlers
	const providerHandlers = useTopicFeedActions()
	const { open, consume, rate, bookmark } = resourceHandlers ?? providerHandlers
	// signed-out visitors don't get the per-user read and rating controls
	const isSignedIn = useIsSignedIn()
	const ResourceIcon = RESOURCE_KIND_ICON[resource.resourceKind]
	// unread rows are bold. consumed rows go muted
	const titleClass = cn(
		"truncate text-sm group-hover:text-foreground group-hover:underline",
		resource.isConsumed ? "text-muted-foreground font-normal" : "text-foreground font-semibold",
	)
	const metadataClass = cn(
		"mt-0.5 text-xs group-hover:text-foreground/80",
		resource.isConsumed ? "text-muted-foreground/70" : "text-muted-foreground",
	)
	// the bookmark toggle's label and tooltip, shared so the two never drift apart
	const bookmarkLabel = resource.isBookmarked ? "Remove bookmark" : "Bookmark"
	return (
		<div className="group hover:bg-accent-foreground/20 relative flex rounded-lg transition-colors">
			{/* the rank aligned with the bookmark toggle */}
			{rank !== null && (
				<span
					className="text-muted-foreground absolute top-1.5 left-0 grid size-11 place-items-center sm:size-8"
					aria-hidden="true"
				>
					<span className="font-display text-sm tabular-nums">{rank}</span>
				</span>
			)}
			{/* the bookmark toggle, filled while bookmarked to the left, and not filled thile unbookmarked to the right */}
			{isSignedIn && (
				<Tooltip>
					<TooltipTrigger
						onClick={() => bookmark(resource.findingId, !resource.isBookmarked)}
						aria-pressed={resource.isBookmarked}
						aria-label={bookmarkLabel}
						className={cn(
							"absolute top-1.5 grid size-11 place-items-center sm:size-8",
							resource.isBookmarked
								? "text-primary left-0"
								: "text-muted-foreground/50 hover:text-foreground right-11 sm:right-8",
						)}
					>
						<Bookmark className={cn("size-3.75", resource.isBookmarked && "fill-current")} strokeWidth={2.5} />
					</TooltipTrigger>
					<TooltipContent>{bookmarkLabel}</TooltipContent>
				</Tooltip>
			)}
			{/* the entire topic resource row is the tap target. it opens the resource and marks it consumed. */}
			<AnchorLink
				href={resource.url}
				onClick={() => open(resource.findingId)}
				className={cn(
					// the left padding clears the rank slot
					"flex min-w-0 flex-1 items-start gap-2.5 py-3 pl-9",
					// only an unbookmarked row has a toggle on the right for the text to clear
					isSignedIn && !resource.isBookmarked ? "pr-20 sm:pr-16" : "pr-10",
				)}
			>
				<ResourceIcon
					className={cn(
						"mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground",
						resource.isConsumed && "opacity-60",
					)}
					aria-label={resource.resourceKind}
				/>
				<div className="min-w-0 flex-1">
					<div className={titleClass}>{resource.title ?? resource.url}</div>
					<div className={metadataClass}>
						{[resource.source, toAgeLabel(resource.publishedAt)].filter(Boolean).join(" · ")}
					</div>
				</div>
			</AnchorLink>
			{/* info button */}
			<ResourceInfo
				resource={resource}
				isRatable={isRatable}
				isSignedIn={isSignedIn}
				onConsume={consume}
				onRate={rate}
			/>
		</div>
	)
}

// the resource info popover. it shows relevance explanation, the fetch date, the view count, and, for a signed-in user, the read toggle and rating buttons
function ResourceInfo({
	resource,
	isRatable,
	isSignedIn,
	onConsume,
	onRate,
}: {
	// the topic finding, whether this user is signed in and may rate it, and the onConsume and onRate handlers
	resource: TopicFinding
	isRatable: boolean
	isSignedIn: boolean
	onConsume: TopicFeedHandlers["consume"]
	onRate: TopicFeedHandlers["rate"]
}) {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						className="text-primary hover:opacity-75 absolute top-1.5 right-0 grid size-11 place-items-center sm:size-8"
						aria-label="Notes and feedback"
					>
						<SquarePen className="size-3.75" strokeWidth={2.5} />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>A topic finding note from Carl</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-lg text-sm">
				<PopoverCloseButton />
				<h2 className={POPOVER_HEADING_CLASS}>Topic Finding</h2>

				{/* the AI explanation of why this resource is relevant, in a scroll box so a long note stays contained */}
				<div className="text-muted-foreground font-display mb-1 text-xs tracking-wide uppercase">{"Carl's notes"}</div>
				<ScrollBox>
					<p>{resource.relevanceExplanation || "No notes yet."}</p>
				</ScrollBox>
				{/* when the resource was fetched and how many times it was opened */}
				<div className="mt-3 space-y-2">
					<InfoSection className="py-0" label="Fetched">
						{new Date(resource.fetchedAt).toLocaleDateString()}
					</InfoSection>
					<InfoSection className="py-0" label="Views">
						{resource.viewCount.toLocaleString()}
					</InfoSection>
				</div>
				{/* the read toggle and rating row, shown only to a signed-in user */}
				{isSignedIn && (
					<div className="mt-3 border-t pt-2">
						<button
							type="button"
							onClick={() => onConsume(resource.findingId, !resource.isConsumed)}
							className="hover:bg-accent flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm sm:min-h-9"
						>
							{resource.isConsumed ? <Circle className="size-4" /> : <Check className="size-4" />}
							{resource.isConsumed ? "Mark as unread" : "Mark as read"}
						</button>
						{/* the rating row, shown only on topics this user owns or subscribes to */}
						{isRatable && (
							<div className="flex min-h-11 items-center justify-between px-2 sm:min-h-9">
								<span className="text-muted-foreground text-xs">Rate this find</span>
								<div className="flex gap-1">
									<ThumbButton
										isActive={resource.rating === "up"}
										label="Thumbs up"
										onClick={() => onRate(resource.findingId, resource.rating === "up" ? null : "up")}
									>
										<ThumbsUp className="size-4" />
									</ThumbButton>
									<ThumbButton
										isActive={resource.rating === "down"}
										label="Thumbs down"
										onClick={() => onRate(resource.findingId, resource.rating === "down" ? null : "down")}
									>
										<ThumbsDown className="size-4" />
									</ThumbButton>
								</div>
							</div>
						)}
					</div>
				)}
			</PopoverContent>
		</Popover>
	)
}

// a thumbs up or down toggle for the rating row
type ThumbButtonProps = { isActive: boolean; label: string; onClick: () => void; children: React.ReactNode }
function ThumbButton({ isActive, label, onClick, children }: ThumbButtonProps) {
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
