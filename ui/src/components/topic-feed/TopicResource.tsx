import type { TopicFinding } from "@shared/contracts"
import { Check, Circle, Info, ThumbsDown, ThumbsUp } from "lucide-react"
import type * as React from "react"
import { AnchorLink } from "@/components/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { cn, RESOURCE_KIND_ICON, toAgeLabel } from "@/lib/utils"
import { type TopicFeedHandlers, useTopicFeedActions } from "@/providers/TopicFeedProvider"

/**
 * A single topic resource row. Clicking it opens the resource and marks the topic finding consumed.
 * Consumed rows appear muted, like an email inbox.
 */
export function TopicResource({ resource, isRatable }: { resource: TopicFinding; isRatable: boolean }) {
	const { open, consume, rate } = useTopicFeedActions()
	const ResourceIcon = RESOURCE_KIND_ICON[resource.resourceKind]
	// unread rows are bold. consumed rows go muted
	const titleClass = cn(
		"truncate text-sm",
		resource.isConsumed ? "text-muted-foreground font-normal" : "text-foreground font-semibold",
	)
	const metadataClass = cn("mt-0.5 text-xs", resource.isConsumed ? "text-muted-foreground/70" : "text-muted-foreground")
	return (
		<div className="relative flex">
			{/* the whole topic resource row is the tap target. it opens the resource and marks it consumed */}
			<AnchorLink
				href={resource.url}
				onClick={() => open(resource.findingId)}
				className="flex min-w-0 flex-1 items-start gap-2.5 py-3 pr-10"
			>
				<ResourceIcon
					className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground", resource.isConsumed && "opacity-60")}
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
			<ResourceInfo resource={resource} isRatable={isRatable} onConsume={consume} onRate={rate} />
		</div>
	)
}

// the resource info popover. it shows Carl's notes, the fetch date, the view count, the consumed toggle, and the rating buttons
function ResourceInfo({
	resource,
	isRatable,
	onConsume,
	onRate,
}: {
	// the topic finding, whether this user may rate it, and the onConsume and onRate handlers
	resource: TopicFinding
	isRatable: boolean
	onConsume: TopicFeedHandlers["consume"]
	onRate: TopicFeedHandlers["rate"]
}) {
	return (
		<Popover>
			<PopoverTrigger
				className="text-muted-foreground hover:text-foreground absolute top-1.5 right-0 grid size-11 place-items-center sm:size-8"
				aria-label="Notes and feedback"
			>
				<Info className="size-3.75" />
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64 text-sm">
				{/* Carl's explanation of why the resource is relevant */}
				<div className="text-muted-foreground font-display mb-1 text-xs tracking-wide uppercase">{`Carl's notes`}</div>
				<p>{resource.relevanceExplanation || "No notes yet."}</p>
				{/* when the resource was fetched and how many times it was opened */}
				<div className="mt-3 space-y-2">
					<InfoBlock label="Fetched">{new Date(resource.fetchedAt).toLocaleDateString()}</InfoBlock>
					<InfoBlock label="Views">{resource.viewCount.toLocaleString()}</InfoBlock>
				</div>
				{/* the isConsumed toggle, then the rating row */}
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
