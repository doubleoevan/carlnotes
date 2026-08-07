import type { TopicScan } from "@shared/contracts"
import { useState } from "react"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { randomThinkingLine } from "@/components/chat/thinkingLines"
import {
	Popover,
	PopoverAnchor,
	PopoverCloseButton,
	PopoverContent,
	PopoverTrigger,
} from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TopicScanFailure } from "@/components/topic/TopicScanFailure"
import { type AllowedNoteUrls, TopicScanRecap } from "@/components/topic/TopicScanRecap"
import { cn, RESOURCE_LIST_CARD_CLASS } from "@/lib/utils"
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
			{/* one row per scan, each drawing its own dashed separator */}
			<div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1")}>
				{scansShown.map((scan) => (
					<ScanRow key={scan.id} scan={scan} allowedUrls={allowedUrls} />
				))}
				{scansShown.length === 0 && (
					<p className="text-muted-foreground py-3 pl-2 text-sm">{"Carl hasn't scanned this topic yet."}</p>
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

// one history scan row, the whole of which opens that brew's note. the note still anchors the popover, so the panel
// comes out of the icon the user is looking at instead of from wherever they happened to click.
// the hover highlight paints on a rounded under-layer, matching the resource rows above it
function ScanRow({ scan, allowedUrls }: { scan: TopicScan; allowedUrls?: AllowedNoteUrls }) {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						className="group after:border-separator-strong relative isolate flex w-full items-center gap-3 py-2.5 pr-1 pl-2 text-left before:absolute before:inset-0 before:-z-10 before:rounded-lg before:transition-colors after:absolute after:inset-x-2 after:top-0 after:border-t after:border-dashed first:after:hidden hover:before:bg-accent-foreground/20"
						aria-describedby={undefined}
					>
						<span className="shrink-0 text-sm">{toScanTimestamp(scan)}</span>
						<ScanStat scan={scan} />
						<PopoverAnchor asChild>
							<span className="grid size-11 shrink-0 place-items-center sm:size-7">
								<NoteIcon />
							</span>
						</PopoverAnchor>
					</PopoverTrigger>
				</TooltipTrigger>
				{/* the whole row is the trigger, so a centred tooltip would float in the middle of it. it sits at
				    the right instead, over the note the row opens */}
				<TooltipContent align="end">A brew note from Carl</TooltipContent>
			</Tooltip>
			<ScanNote scan={scan} allowedUrls={allowedUrls} />
		</Popover>
	)
}

// the scan's one-line stat: kept and found counts when succeeded, a shimmering thinking line while running, otherwise the failed message
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
	return <ScanThinkingLine />
}

// a thinking line while a scan runs, picked once so the poll's re-renders don't swap it mid-scan
function ScanThinkingLine() {
	const [thinkingLine] = useState(randomThinkingLine)
	return <span className="shimmer-text min-w-0 flex-1 truncate text-xs">{`Carl is ${thinkingLine}…`}</span>
}

// the history scan note itself: the recap, and for a failed scan, the reason it failed
function ScanNote({ scan, allowedUrls }: { scan: TopicScan; allowedUrls?: AllowedNoteUrls }) {
	return (
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
	)
}

// the timestamp for a scan row. a running scan only has its start time
function toScanTimestamp(scan: TopicScan): string {
	const moment = new Date(scan.finishedAt ?? scan.startedAt)
	const day = moment.toLocaleDateString("en-US", { month: "short", day: "numeric" })
	const time = moment.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()
	return `${day} · ${time}`
}
