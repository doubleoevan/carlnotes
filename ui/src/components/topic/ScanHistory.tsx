import type { TopicScan } from "@shared/contracts"
import { SquarePen } from "lucide-react"
import { useState } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { ScanScroll } from "@/components/ScanNote.tsx"
import { toDollarLabel, toDurationLabel } from "@/lib/utils"
import { ExpanderButton } from "./ExpanderButton"

// the most scan rows shown before the "+ # older" expander
const MAX_HISTORY_SCANS = 10

// the collapsible scan history, newest first, capped until expanded
export function ScanHistory({ scans }: { scans: TopicScan[] }) {
	const [isExpanded, setIsExpanded] = useState(false)
	// cap the rows unless expanded
	const scansShown = isExpanded ? scans : scans.slice(0, MAX_HISTORY_SCANS)
	const olderCount = scans.length - MAX_HISTORY_SCANS
	return (
		<Accordion type="multiple" defaultValue={["history"]}>
			<AccordionItem value="history">
				<AccordionTrigger className="py-2">
					<span className="font-display text-lg">History</span>
				</AccordionTrigger>
				<AccordionContent>
					{/* one row per scan with dashed separators */}
					<div className="divide-separator divide-y divide-dashed">
						{scansShown.map((scan) => (
							<ScanRow key={scan.id} scan={scan} />
						))}
						{scansShown.length === 0 && (
							<p className="text-muted-foreground py-3 text-sm">{"Carl hasn't scanned this topic yet."}</p>
						)}
					</div>
					{olderCount > 0 && (
						<ExpanderButton
							isExpanded={isExpanded}
							moreLabel={`+ ${olderCount} older `}
							onToggle={() => setIsExpanded(!isExpanded)}
						/>
					)}
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	)
}

// one scan row: the timestamp and a one-line stat, and the ⓘ popover
function ScanRow({ scan }: { scan: TopicScan }) {
	return (
		<div className="flex items-center gap-3 py-2.5 pl-3">
			<span className="shrink-0 text-sm">{toScanTimestamp(scan)}</span>
			<ScanStat scan={scan} />
			<ScanInfo scan={scan} />
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

// the scan note popover: Carl's full summary, then how long it took and the cost.
function ScanInfo({ scan }: { scan: TopicScan }) {
	// how long the scan took derived from its start and finish times
	const durationMs = scan.finishedAt ? new Date(scan.finishedAt).getTime() - new Date(scan.startedAt).getTime() : null
	const duration = toDurationLabel(durationMs)
	return (
		<Popover>
			<PopoverTrigger
				className="text-primary hover:opacity-75 grid size-11 shrink-0 place-items-center sm:size-7"
				aria-label="Scan details"
			>
				<SquarePen className="size-3.75" strokeWidth={2.5} />
			</PopoverTrigger>
			<PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-lg text-sm">
				<PopoverCloseButton />
				{/* why a failed scan failed, above the recap, since a failed scan has no recap to show */}
				{scan.status === "failed" && (
					<>
						<div className="text-muted-foreground font-display mb-1 text-xs tracking-wide uppercase">Failed</div>
						<p className="text-destructive mb-3">{scan.error ?? "This one didn't brew."}</p>
					</>
				)}

				{/* Carl's recap of the whole scan, rendered Markdown inside a scrollable bordered box */}
				<div className="text-muted-foreground font-display mb-1 text-xs tracking-wide uppercase">{"Carl's Notes"}</div>
				{scan.scanSummary ? <ScanScroll markdown={scan.scanSummary} /> : <p>No summary yet.</p>}
				{/* how long it took, and the spend when the api shared it with the owner or an admin. counts show on the row */}
				{(duration || scan.cost !== null) && (
					<div className="text-muted-foreground mt-3 space-y-0.5 border-t pt-2 text-xs">
						{duration && <div>{duration} taken</div>}
						{scan.cost !== null && <div>cost: {toDollarLabel(scan.cost)}</div>}
					</div>
				)}
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
