import { fetchScanNote } from "@carlnotes/client/topicClient"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { TopicScan } from "@carlnotes/contracts/topics"
import { useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { Pagination } from "@/components/common/Pagination"
import { ThinkingLine } from "@/components/common/ThinkingLine"
import { PodcastEpisodeNumberPill } from "@/components/podcast/PodcastEpisodePill"
import {
	Popover,
	PopoverAnchor,
	PopoverCloseButton,
	PopoverContent,
	PopoverTrigger,
} from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { toRenderedRows } from "@/lib/renderedRows"
import {
	DASHED_ROW_CLASS,
	LIST_ROW_HOVER_CLASS,
	POPOVER_PANEL_CLASS,
	RESOURCE_LIST_CARD_CLASS,
	SECTION_LABEL_CLASS,
} from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { CollapsibleSection } from "./CollapsibleSection"
import { TopicScanFailure } from "./TopicScanFailure"
import { type AllowedScanNoteUrls, TopicScanRecap, toNotesMarkdown } from "./TopicScanRecap"

// how many scan rows the history shows on one page
const SCANS_PER_PAGE = 5

/**
 * The collapsible scan history, newest first, one page of scans at a time.
 */
export function TopicScanHistory({
	scans,
	allowedUrls,
	findings,
	topic,
}: {
	scans: TopicScan[]
	allowedUrls?: AllowedScanNoteUrls
	findings?: TopicFinding[]
	// names the topic in each diary's copied Markdown
	topic: { id: string; name: string; prompt: string }
}) {
	// the page that was opened, and the page shown, which stays within the history's pages
	const [openedPageNumber, setOpenedPageNumber] = useState(1)
	const pageCount = Math.ceil(scans.length / SCANS_PER_PAGE)
	const pageNumber = Math.min(openedPageNumber, Math.max(1, pageCount))
	return (
		<CollapsibleSection value="history" title="Brew diary">
			<TopicScanHistoryCard
				scans={scans}
				pageNumber={pageNumber}
				allowedUrls={allowedUrls}
				findings={findings}
				topic={topic}
			/>
			{/* the page numbers under the card */}
			{pageCount > 1 && (
				<Pagination
					ariaLabel="Brew diary pages"
					pageNumber={pageNumber}
					pageCount={pageCount}
					onOpenPage={setOpenedPageNumber}
				/>
			)}
		</CollapsibleSection>
	)
}

/**
 * The scan history's card, with a row per scan on the page shown, or the line that an empty history shows.
 */
export function TopicScanHistoryCard({
	scans,
	pageNumber,
	allowedUrls,
	findings,
	topic,
}: {
	scans: TopicScan[]
	pageNumber: number
	allowedUrls?: AllowedScanNoteUrls
	findings?: TopicFinding[]
	// names the topic in each diary's copied Markdown
	topic: { id: string; name: string; prompt: string }
}) {
	// the scans the card renders: the page shown, and the first NO_SCRIPT_ROW_LIMIT scans for a page load without
	// JavaScript
	const renderedScans = toRenderedRows(scans, { pageNumber, pageSize: SCANS_PER_PAGE })
	return (
		<div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1")}>
			{/* one row per rendered scan, each drawing its own dashed separator */}
			{renderedScans.map(({ row: scan, className }) => (
				<ScanRow
					key={scan.id}
					scan={scan}
					allowedUrls={allowedUrls}
					findings={findings?.filter((finding) => finding.scanId === scan.id)}
					topic={topic}
					className={className}
				/>
			))}
			{scans.length === 0 && (
				<p className="text-muted-foreground py-3 pl-2 text-sm">{"Carl hasn't scanned this topic yet."}</p>
			)}
		</div>
	)
}

// one history scan row, the whole of which opens that brew's note
function ScanRow({
	scan,
	allowedUrls,
	findings,
	topic,
	className,
}: {
	scan: TopicScan
	allowedUrls?: AllowedScanNoteUrls
	findings?: TopicFinding[]
	topic: { id: string; name: string; prompt: string }
	className?: string
}) {
	// the scan recap is loaded on the first open and kept for the rest of the page's life
	const [scanSummary, setScanSummary] = useState<string | null>(null)
	const [isNoteLoaded, setIsNoteLoaded] = useState(false)
	function handleOpenScanNote(isOpen: boolean): void {
		if (isOpen && !isNoteLoaded) {
			fetchScanNote(scan.id)
				.then((note) => {
					setScanSummary(note)
					setIsNoteLoaded(true)
				})
				.catch((error) => console.error("scan note load failed", error))
		}
	}

	return (
		<Popover onOpenChange={handleOpenScanNote}>
			{/* the scan row, which draws the dashed separator and holds the trigger and the podcast episode pill */}
			<div className={cn(DASHED_ROW_CLASS, className)}>
				<Tooltip>
					<TooltipTrigger asChild>
						<PopoverTrigger
							className={cn(LIST_ROW_HOVER_CLASS, "group flex w-full items-center gap-3 py-2.5 pr-1 pl-2 text-left")}
							aria-describedby={undefined}
						>
							{/* the time is formatted in the local time zone, so the server's markup can differ */}
							<span className="shrink-0 text-sm" suppressHydrationWarning>
								{toScanTimestamp(scan)}
							</span>
							<ScanStat scan={scan} />
							{/* the space under the podcast episode pill, which sits over the row */}
							{scan.podcastEpisode && <span className="w-14 shrink-0" aria-hidden="true" />}
							<PopoverAnchor asChild>
								<span className="grid size-11 shrink-0 place-items-center sm:size-7">
									<NoteIcon />
								</span>
							</PopoverAnchor>
						</PopoverTrigger>
					</TooltipTrigger>
					{/* the whole row is the trigger, so a centered tooltip would show in the middle of it.
					    it sits at the right instead, over the note the row opens */}
					<TooltipContent align="end">A brew note from Carl</TooltipContent>
				</Tooltip>
				{/* the pill of the scan's podcast episode, which plays the podcast episode */}
				{scan.podcastEpisode && (
					<PodcastEpisodeNumberPill
						podcastEpisode={scan.podcastEpisode}
						className="absolute top-1/2 right-13 z-10 -translate-y-1/2 sm:right-10"
					/>
				)}
			</div>
			<ScanNote
				scan={scan}
				scanSummary={scanSummary}
				isNoteLoaded={isNoteLoaded}
				allowedUrls={allowedUrls}
				findings={findings}
				topic={topic}
			/>
		</Popover>
	)
}

// the scan's one-line stat: its read and kept counts if it succeeded, failed if it failed, and a shimmering thinking
// line while it runs
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
	return <ThinkingLine className="min-w-0 flex-1 truncate text-xs" />
}

// the history scan note: the complete recap, and for a failed scan, the reason it failed
function ScanNote({
	scan,
	scanSummary,
	isNoteLoaded,
	allowedUrls,
	findings,
	topic,
}: {
	scan: TopicScan
	scanSummary: string | null
	isNoteLoaded: boolean
	allowedUrls?: AllowedScanNoteUrls
	findings?: TopicFinding[]
	topic: { id: string; name: string; prompt: string }
}) {
	// the note is fetched on click, and a loading mug brews in its place until it loads
	if (!isNoteLoaded) {
		return (
			<PopoverContent align="end" className={POPOVER_PANEL_CLASS}>
				<PopoverCloseButton />
				<CoffeeLoading className="min-h-24 text-base" />
			</PopoverContent>
		)
	}

	return (
		<PopoverContent align="end" className={POPOVER_PANEL_CLASS}>
			<PopoverCloseButton />
			{/* why a failed scan failed, above the recap */}
			{scan.status === "failed" && (
				<div className="mb-3">
					<div className={cn(SECTION_LABEL_CLASS, "mb-1")}>Failed</div>
					<TopicScanFailure error={scan.error} />
				</div>
			)}
			<TopicScanRecap
				scan={{ ...scan, scanSummary }}
				allowedUrls={allowedUrls}
				findings={findings}
				copyMarkdown={toNotesMarkdown({
					topicId: topic.id,
					topicName: topic.name,
					prompt: topic.prompt,
					note: scanSummary,
					findings,
				})}
			/>
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
