import type { TopicFeed } from "@shared/contracts"
import { Download, ExternalLink, SquarePen } from "lucide-react"
import type * as React from "react"
import { useState } from "react"
import { AnchorLink } from "@/components/AnchorLink"
import { Badge } from "@/components/primitives/badge"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { ScanScroll } from "@/components/ScanNote.tsx"
import { useIsVisible } from "@/hooks/useIsVisible"
import { cn, toAgeLabel, toDollarLabel, toDurationLabel } from "@/lib/utils"
import { TopicResource } from "./TopicResource"

// the max resource rows shown before the "+ # more" expander
const MAX_RESOURCES = 5

// the topic feed and its position in the section. the position staggers the entrance animation
type TopicProps = { topic: TopicFeed; index: number }

/**
 * A single topic in the feed. The topic header, then up to five topic resource rows.
 * It stays hidden until scrolled into view, then plays the hydrate animation.
 */
export function Topic({ topic, index }: TopicProps) {
	const [isExpanded, setIsExpanded] = useState(false)

	// cap the resources shown unless the topic is expanded
	const resourcesShown = isExpanded ? topic.findings : topic.findings.slice(0, MAX_RESOURCES)
	const moreResourcesCount = topic.findings.length - MAX_RESOURCES

	// hide the topic until it scrolls into view, then play the hydrate animation
	const { ref, isVisible } = useIsVisible<HTMLDivElement>()
	return (
		<div
			ref={ref}
			className={cn("py-4", isVisible ? "animate-hydrate" : "opacity-0")}
			style={{ animationDelay: `${Math.min(index, 3) * 50}ms` }}
		>
			{/* header: title linking to the topic page, info button, tag pills, and the "# new" count */}
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<AnchorLink href={`/topics/${topic.id}`} className="min-w-0 hover:underline">
							<h3 className="font-display truncate pt-1 pl-4 pb-1 text-lg leading-tight">{topic.name}</h3>
						</AnchorLink>
						<TopicInfo topic={topic} />
					</div>
					{/* tags, left-padded to line the text up with the resource icons below them */}
					<div className="mt-1.5 pl-3 flex flex-wrap gap-1">
						{topic.tags.map((tag) => (
							<Badge key={tag} variant="secondary">
								{tag}
							</Badge>
						))}
					</div>
				</div>
				{/* the "# new" count opens the info content, anchored to itself */}
				{topic.newCount > 0 && <NewCountInfo topic={topic} />}
			</div>
			{/* resource rows with dashed separators between them */}
			<div className="divide-separator mt-1 pl-3 divide-y divide-dashed">
				{resourcesShown.map((resource) => (
					<TopicResource key={resource.findingId} resource={resource} isRatable={topic.canRate} />
				))}
				{resourcesShown.length === 0 && (
					<p className="text-muted-foreground py-3 text-sm">Nothing new worth your time. Carl checked. Twice.</p>
				)}
			</div>
			{moreResourcesCount > 0 && (
				<Button
					variant="link"
					size="sm"
					onClick={() => setIsExpanded(!isExpanded)}
					className="group text-link mt-1 h-auto min-h-11 justify-start pr-0 pl-6 hover:no-underline sm:min-h-9"
				>
					{/* the show label carries the underline on hover. the arrow does not */}
					<span className="underline-offset-4 group-hover:underline">
						{isExpanded ? "show less " : `+ ${moreResourcesCount} more `}
					</span>
					<span className="text-lg leading-none">{isExpanded ? "▴" : "▾"}</span>
				</Button>
			)}
		</div>
	)
}

// the topic info popover from the note icon anchored at the icon
function TopicInfo({ topic }: { topic: TopicFeed }) {
	return (
		<Popover>
			<PopoverTrigger
				className="text-primary hover:opacity-75 grid size-11 shrink-0 place-items-center sm:size-7"
				aria-label="Topic details"
			>
				<SquarePen className="size-3.75" strokeWidth={2.5} />
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[calc(100vw-2rem)] max-w-lg text-sm">
				<TopicInfoContent topic={topic} />
			</PopoverContent>
		</Popover>
	)
}

// the "# new" count as its own popover trigger, showing the same info content anchored at the count on the right
export function NewCountInfo({ topic }: { topic: TopicFeed }) {
	return (
		<Popover>
			<PopoverTrigger className="text-badge hover:opacity-75 shrink-0 text-sm font-semibold">
				{topic.newCount} new
			</PopoverTrigger>
			<PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-lg text-sm">
				<TopicInfoContent topic={topic} />
			</PopoverContent>
		</Popover>
	)
}

// the shared info content: the topic prompt and notes, attachments, sources, the schedule with spend, and the subscriber count
function TopicInfoContent({ topic }: { topic: TopicFeed }) {
	// how long the last scan took, shown under the last scan age
	const lastScanDuration = toDurationLabel(topic.lastScanDurationMs)
	return (
		<>
			<PopoverCloseButton />
			{/* the info blocks split by dashed rules, mirroring the topic page card */}
			<div className="divide-separator divide-y divide-dashed">
				{/* topic prompt */}
				<InfoBlock label="Carl's prompt">{topic.prompt || "—"}</InfoBlock>
				{/* recap of the latest scan as rendered Markdown, in a scrollable bordered box */}
				{topic.scanSummary && (
					<InfoBlock label="Carl's notes">
						<ScanScroll markdown={topic.scanSummary} />
					</InfoBlock>
				)}
				{/* attachments, one per row. a url links out to its page, a file downloads for the owner */}
				{topic.attachments.length > 0 && (
					<InfoBlock label="Attachments">
						<div className="flex flex-col gap-1">
							{topic.attachments.map((attachment) => (
								<AttachmentPill key={attachment.id} attachment={attachment} isDownloadable={topic.isOwner} />
							))}
						</div>
					</InfoBlock>
				)}
				{/* the topic's sources */}
				{topic.sources.length > 0 && (
					<InfoBlock label="Sources">{topic.sources.map((source) => source.kind).join(", ")}</InfoBlock>
				)}
				{/* the frequency, the last scan age, and how long that scan took */}
				<InfoBlock label="Schedule">
					{topic.frequency}
					<div className="text-muted-foreground mt-0.5 text-xs">
						last scan {topic.lastScanAt ? toAgeLabel(topic.lastScanAt) : "never"}
					</div>
					{lastScanDuration && <div className="text-muted-foreground text-xs">{lastScanDuration} taken</div>}
				</InfoBlock>
				{/* the subscriber count */}
				<InfoBlock label="Subscribers">{topic.subscriberCount.toLocaleString()}</InfoBlock>
				{/* this month's total scan spend, for the owner and admins */}
				{topic.monthCost !== null && <InfoBlock label="Cost this month">{toDollarLabel(topic.monthCost)}</InfoBlock>}
			</div>
		</>
	)
}

// a labeled block inside the info popover, padded so the dashed rules sit evenly between blocks
function InfoBlock({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="py-3 first:pt-0 last:pb-0">
			<div className="text-muted-foreground font-display text-xs tracking-wide uppercase">{label}</div>
			<div className="text-foreground mt-1">{children}</div>
		</div>
	)
}

// one attachment row. a url links out to its page, a file downloads for the owner. the label truncates and underlines on hover
function AttachmentPill({
	attachment,
	isDownloadable,
}: {
	attachment: TopicFeed["attachments"][number]
	isDownloadable: boolean
}) {
	// a url attachment links out to its origin page, its url truncated and underlining on hover
	if (attachment.sourceUrl) {
		return (
			<AnchorLink
				href={attachment.sourceUrl}
				className="group text-secondary-foreground hover:text-foreground flex items-center gap-1 text-xs"
			>
				<span className="min-w-0 truncate group-hover:underline">{attachment.sourceUrl}</span>
				<ExternalLink aria-hidden="true" className="size-3 shrink-0" />
			</AnchorLink>
		)
	}

	// a file download must be a full request, so it bypasses AnchorLink's client-side routing
	if (isDownloadable) {
		return (
			<a
				href={`/api/attachments/${attachment.id}/download`}
				download={attachment.filename}
				className="group text-secondary-foreground hover:text-foreground flex items-center gap-1 text-xs"
			>
				<span className="min-w-0 truncate group-hover:underline">{attachment.filename}</span>
				<Download aria-hidden="true" className="size-3 shrink-0" />
			</a>
		)
	}

	// a non-owner sees a plain, non-downloadable file name
	return <span className="text-secondary-foreground truncate text-xs">{attachment.filename}</span>
}
