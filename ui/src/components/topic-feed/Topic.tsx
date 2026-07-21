import type { TopicFeed } from "@shared/contracts"
import { Info } from "lucide-react"
import type * as React from "react"
import { useState } from "react"
import { Badge } from "@/components/primitives/badge"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { useIsVisible } from "@/hooks/useIsVisible"
import { cn } from "@/lib/utils"
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
			{/* header: title, info button, tag pills, and the "# new" count */}
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<h3 className="font-display truncate text-lg leading-tight">{topic.name}</h3>
						<TopicInfo topic={topic} />
					</div>
					<div className="mt-1.5 flex flex-wrap gap-1">
						{topic.tags.map((tag) => (
							<Badge key={tag} variant="secondary">
								{tag}
							</Badge>
						))}
					</div>
				</div>
				{/* the "# new" count of unread findings */}
				{topic.newCount > 0 && <span className="text-badge shrink-0 text-sm font-semibold">{topic.newCount} new</span>}
			</div>
			{/* resource rows with dashed separators between them */}
			<div className="divide-separator mt-1 divide-y divide-dashed">
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
					className="text-link mt-1 h-auto min-h-11 justify-start px-0 sm:min-h-9"
				>
					{/* the label, then a larger arrow glyph */}
					{isExpanded ? "show less " : `+ ${moreResourcesCount} more `}
					<span className="text-lg leading-none">{isExpanded ? "▴" : "▾"}</span>
				</Button>
			)}
		</div>
	)
}

// the topic info popover. it shows Carl's prompt and notes, attachments, sources, the schedule, and the subscriber count
function TopicInfo({ topic }: { topic: TopicFeed }) {
	return (
		<Popover>
			<PopoverTrigger
				className="text-muted-foreground hover:text-foreground grid size-11 shrink-0 place-items-center sm:size-7"
				aria-label="Topic details"
			>
				<Info className="size-3.75" />
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 space-y-3 text-sm">
				{/* Carl's prompt for this topic */}
				<InfoBlock label="Carl's prompt">{topic.prompt || "—"}</InfoBlock>
				{/* Carl's recap of the latest scan */}
				{topic.scanSummary && <InfoBlock label="Carl's notes">{topic.scanSummary}</InfoBlock>}
				{/* attachments. the download marker only shows on topics the viewer owns */}
				{topic.attachments.length > 0 && (
					<InfoBlock label="Attachments">
						<div className="flex flex-wrap gap-1">
							{topic.attachments.map((att) => (
								<AttachmentPill key={att.id} filename={att.filename} isDownloadable={topic.isOwner} />
							))}
						</div>
					</InfoBlock>
				)}
				{/* the topic's sources and the schedule */}
				{topic.sources.length > 0 && (
					<InfoBlock label="Sources">{topic.sources.map((source) => source.kind).join(", ")}</InfoBlock>
				)}
				<InfoBlock label="Schedule">{scheduleLine(topic)}</InfoBlock>
				{/* the subscriber count */}
				<InfoBlock label="Subscribers">{topic.subscriberCount.toLocaleString()}</InfoBlock>
			</PopoverContent>
		</Popover>
	)
}

// a labeled block inside the info popover
function InfoBlock({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="text-muted-foreground font-display text-xs tracking-wide uppercase">{label}</div>
			<div className="text-foreground mt-0.5">{children}</div>
		</div>
	)
}

// an attachment chip. the download arrow only shows if the viewer owns the topic
function AttachmentPill({ filename, isDownloadable }: { filename: string; isDownloadable: boolean }) {
	return (
		<span className="bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs">
			{filename}
			{isDownloadable ? " ↓" : ""}
		</span>
	)
}

// the schedule line: frequency, last scan, and created date
function scheduleLine(topic: TopicFeed): string {
	const last = topic.lastScanAt ? new Date(topic.lastScanAt).toLocaleDateString() : "never"
	const created = new Date(topic.createdAt).toLocaleDateString()
	return `${topic.frequency} · last scan ${last} · created ${created}`
}
