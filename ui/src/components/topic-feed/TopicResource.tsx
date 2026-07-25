import type { TopicFinding } from "@shared/contracts"
import { Check, Circle, SquarePen, ThumbsDown, ThumbsUp } from "lucide-react"
import type * as React from "react"
import { AnchorLink } from "@/components/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { ScrollBox } from "@/components/ScanNote.tsx"
import { cn, RESOURCE_KIND_ICON, toAgeLabel } from "@/lib/utils"
import { type TopicFeedHandlers, useIsSignedIn, useTopicFeedActions } from "@/providers/TopicFeedProvider"

// the row's topic finding, whether this user may rate it, and optional handlers that override the topic feed provider's handlers
type TopicResourceProps = { resource: TopicFinding; isRatable: boolean; resourceHandlers?: TopicFeedHandlers }

/**
 * A single topic resource row. Clicking it opens the resource and marks the topic finding consumed.
 * Consumed rows appear muted, like an email inbox.
 */
export function TopicResource({ resource, isRatable, resourceHandlers }: TopicResourceProps) {
	// the topic page passes handlers that reload its own payload. the homepage falls back to the shared provider's
	const providerHandlers = useTopicFeedActions()
	const { open, consume, rate } = resourceHandlers ?? providerHandlers
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
	return (
		<div className="group hover:bg-accent-foreground/20 relative flex rounded-lg pl-2 transition-colors">
			{/* the entire topic resource row is the tap target. it opens the resource and marks it consumed. */}
			<AnchorLink
				href={resource.url}
				onClick={() => open(resource.findingId)}
				className="flex min-w-0 flex-1 items-start gap-2.5 py-3 pr-10"
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
			<PopoverTrigger
				className="text-primary hover:opacity-75 absolute top-1.5 right-0 grid size-11 place-items-center sm:size-8"
				aria-label="Notes and feedback"
			>
				<SquarePen className="size-3.75" strokeWidth={2.5} />
			</PopoverTrigger>
			<PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-lg text-sm">
				<PopoverCloseButton />
				{/* the AI explanation of why this resource is relevant, in a scroll box so a long note stays contained */}
				<div className="text-muted-foreground font-display mb-1 text-xs tracking-wide uppercase">{"Carl's notes"}</div>
				<ScrollBox>
					<p>{resource.relevanceExplanation || "No notes yet."}</p>
				</ScrollBox>
				{/* when the resource was fetched and how many times it was opened */}
				<div className="mt-3 space-y-2">
					<InfoBlock label="Fetched">{new Date(resource.fetchedAt).toLocaleDateString()}</InfoBlock>
					<InfoBlock label="Views">{resource.viewCount.toLocaleString()}</InfoBlock>
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

// a labeled block inside the info popover
function InfoBlock({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="text-muted-foreground font-display text-xs tracking-wide uppercase">{label}</div>
			<div className="text-foreground mt-0.5 text-sm">{children}</div>
		</div>
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
