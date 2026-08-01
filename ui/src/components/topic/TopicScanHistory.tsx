import type { TopicScan } from "@shared/contracts"
import { SquarePen } from "lucide-react"
import { useState } from "react"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TopicScanFailure } from "@/components/topic/TopicScanFailure"
import { type AllowedNoteUrls, TopicScanRecap } from "@/components/topic/TopicScanRecap"
import { CollapsibleSection } from "./CollapsibleSection"
import { MoreButton } from "./MoreButton"

// the most scan rows shown before the "+ # older" expander
const MAX_HISTORY_SCANS = 5

// the collapsible scan history, newest first, capped until expanded.
// allowedUrls lets a recap cite the topic's still-kept findings as real links. a dropped finding's link renders as plain text
export function TopicScanHistory({ scans, allowedUrls }: { scans: TopicScan[]; allowedUrls?: AllowedNoteUrls }) {
	const [isExpanded, setIsExpanded] = useState(false)
	// cap the rows unless expanded
	const scansShown = isExpanded ? scans : scans.slice(0, MAX_HISTORY_SCANS)
	const olderCount = scans.length - MAX_HISTORY_SCANS
	return (
		<CollapsibleSection value="history" title="Brew diary">
			{/* one row per scan with dashed separators */}
			<div className="divide-separator divide-y divide-dashed">
				{scansShown.map((scan) => (
					<ScanRow key={scan.id} scan={scan} allowedUrls={allowedUrls} />
				))}
				{scansShown.length === 0 && (
					<p className="text-muted-foreground py-3 pl-9 text-sm">{"Carl hasn't scanned this topic yet."}</p>
				)}
			</div>
			{olderCount > 0 && (
				<MoreButton
					isExpanded={isExpanded}
					moreLabel={`+ ${olderCount} older `}
					onToggle={() => setIsExpanded(!isExpanded)}
				/>
			)}
		</CollapsibleSection>
	)
}

// one scan row: the timestamp and a one-line stat, and the ⓘ popover.
// the left padding matches the expander below the rows, so the diary reads as one column
function ScanRow({ scan, allowedUrls }: { scan: TopicScan; allowedUrls?: AllowedNoteUrls }) {
	return (
		<div className="flex items-center gap-3 py-2.5 pl-9">
			<span className="shrink-0 text-sm">{toScanTimestamp(scan)}</span>
			<ScanStat scan={scan} />
			<ScanInfo scan={scan} allowedUrls={allowedUrls} />
		</div>
	)
}

// the scan's one-line stat: kept and found counts when succeeded, a shimmering "reading" while running, otherwise the failed message
function ScanStat({ scan }: { scan: TopicScan }) {
	if (scan.status === "succeeded") {
		return (
			<span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
				read {scan.foundCount} · kept {scan.keptCount}
			</span>
		)
	}
	if (scan.status === "failed") {
		return <span className="text-destructive min-w-0 flex-1 truncate text-xs">failed</span>
	}
	return <span className="shimmer-text min-w-0 flex-1 truncate text-xs">Carl is reading…</span>
}

// the scan note popover trigger: an icon that opens the shared recap content
function ScanInfo({ scan, allowedUrls }: { scan: TopicScan; allowedUrls?: AllowedNoteUrls }) {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						className="text-primary hover:opacity-75 grid size-11 shrink-0 place-items-center sm:size-7"
						aria-label="Scan details"
					>
						<SquarePen className="size-3.75" strokeWidth={2.5} />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>A brew note from Carl</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-lg text-sm">
				<PopoverCloseButton />
				{/* why a failed scan failed, above the recap, since a failed scan has no recap to show */}
				{scan.status === "failed" && (
					<div className="mb-3">
						<div className="text-muted-foreground font-display mb-1 text-xs tracking-wide uppercase">Failed</div>
						<TopicScanFailure error={scan.error} />
					</div>
				)}
				<TopicScanRecap scan={scan} allowedUrls={allowedUrls} />
			</PopoverContent>
		</Popover>
	)
}

// the timestamp for a scan row. a running scan only has its start time
function toScanTimestamp(scan: TopicScan): string {
	const moment = new Date(scan.finishedAt ?? scan.startedAt)
	const day = moment.toLocaleDateString("en-US", { month: "short", day: "numeric" })
	const time = moment.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()
	return `${day} · ${time}`
}
