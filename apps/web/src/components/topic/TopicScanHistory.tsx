import { type RemoveTopicSourceStatus, removeTopicSource } from "@carlnotes/client/topicClient"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import { KEEP_ONE_SOURCE_MESSAGE } from "@carlnotes/contracts/sources"
import type { ScanNote, TopicScan } from "@carlnotes/contracts/topics"
import { toMonthDayLabel } from "@carlnotes/core/lib/labels"
import { useState } from "react"
import { toast } from "sonner"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Pagination } from "@/components/common/Pagination"
import type { SourceRemoval } from "@/components/common/SourceResultsChart"
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
import { useScanNote } from "@/hooks/useScanNote"
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

// a Source that a scan's chart offers to remove, named by its full label
type RemovableTopicSource = { sourceId: string; label: string }

/**
 * The collapsible scan history, newest first, one page of scans at a time. A user who may edit the topic can remove
 * a current Source from a scan's chart.
 */
export function TopicScanHistory({
	scans,
	allowedUrls,
	findings,
	topic,
	canEdit,
	topicSources,
	onReloadTopicPage,
}: {
	scans: TopicScan[]
	allowedUrls?: AllowedScanNoteUrls
	findings?: TopicFinding[]
	// names the topic in each diary's copied Markdown
	topic: { id: string; name: string; prompt: string }
	// whether the user may edit the topic, and the topic's current Sources with their kinds
	canEdit: boolean
	topicSources: { id: string; sourceKind: string }[]
	onReloadTopicPage: () => Promise<void>
}) {
	// the page that was opened, and the page shown, which stays within the history's pages
	const [openedPageNumber, setOpenedPageNumber] = useState(1)
	const pageCount = Math.ceil(scans.length / SCANS_PER_PAGE)
	const pageNumber = Math.min(openedPageNumber, Math.max(1, pageCount))

	// the Source the confirmation dialog asks about
	const [removingTopicSource, setRemovingTopicSource] = useState<RemovableTopicSource | null>(null)

	// a tap on a trash button asks to confirm, unless the Source is the topic's last one
	const handleRemoveSource = (sourceId: string, label: string): void => {
		if (topicSources.length <= 1) {
			toast.error(KEEP_ONE_SOURCE_MESSAGE)
			return
		}
		setRemovingTopicSource({ sourceId, label })
	}

	// the Sources an editor may remove, never web search, and the trash button's handler
	const sourceRemoval: SourceRemoval | undefined = canEdit
		? {
				removableSourceIds: new Set(
					topicSources.filter((topicSource) => topicSource.sourceKind !== "search").map(({ id }) => id),
				),
				onRemoveSource: handleRemoveSource,
			}
		: undefined
	return (
		<CollapsibleSection value="history" title="Brew diary">
			<TopicScanHistoryCard
				scans={scans}
				pageNumber={pageNumber}
				allowedUrls={allowedUrls}
				findings={findings}
				topic={topic}
				sourceRemoval={sourceRemoval}
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
			{/* the confirmation a chart's trash button opens */}
			{removingTopicSource && (
				<RemoveTopicSourceDialog
					topicId={topic.id}
					topicSource={removingTopicSource}
					onTopicSourceRemoved={onReloadTopicPage}
					onClose={() => setRemovingTopicSource(null)}
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
	sourceRemoval,
}: {
	scans: TopicScan[]
	pageNumber: number
	allowedUrls?: AllowedScanNoteUrls
	findings?: TopicFinding[]
	// names the topic in each diary's copied Markdown
	topic: { id: string; name: string; prompt: string }
	// the Sources each scan's chart offers to remove, and what a tap on a trash button does
	sourceRemoval?: SourceRemoval
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
					sourceRemoval={sourceRemoval}
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
	sourceRemoval,
}: {
	scan: TopicScan
	allowedUrls?: AllowedScanNoteUrls
	findings?: TopicFinding[]
	topic: { id: string; name: string; prompt: string }
	className?: string
	sourceRemoval?: SourceRemoval
}) {
	// the scan's note, read as soon as the pointer, focus, or a touch reaches the row, and on open
	const { scanNote, scanNoteTriggerProps, handleScanNoteOpenChange } = useScanNote(scan)
	return (
		<Popover onOpenChange={handleScanNoteOpenChange}>
			{/* the scan row, which draws the dashed separator and holds the trigger and the podcast episode pill */}
			<div className={cn(DASHED_ROW_CLASS, className)}>
				<Tooltip>
					<TooltipTrigger asChild>
						<PopoverTrigger
							{...scanNoteTriggerProps}
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
			<ScanNotePanel
				scan={scan}
				scanNote={scanNote}
				allowedUrls={allowedUrls}
				findings={findings}
				topic={topic}
				sourceRemoval={sourceRemoval}
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
function ScanNotePanel({
	scan,
	scanNote,
	allowedUrls,
	findings,
	topic,
	sourceRemoval,
}: {
	scan: TopicScan
	// the scan's note, null until its read returns
	scanNote: ScanNote | null
	allowedUrls?: AllowedScanNoteUrls
	findings?: TopicFinding[]
	topic: { id: string; name: string; prompt: string }
	sourceRemoval?: SourceRemoval
}) {
	// a loading mug shows in the note's place until its read returns
	if (!scanNote) {
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
				scan={{ ...scan, ...scanNote }}
				allowedUrls={allowedUrls}
				findings={findings}
				copyMarkdown={toNotesMarkdown({
					topicId: topic.id,
					topicName: topic.name,
					prompt: topic.prompt,
					note: scanNote.scanSummary,
					findings,
				})}
				sourceRemoval={sourceRemoval}
			/>
		</PopoverContent>
	)
}

// what a user reads after a Source removal that did not go through, keyed by the reason
const TOPIC_SOURCE_REMOVAL_MESSAGES: Record<Exclude<RemoveTopicSourceStatus, "removed">, string> = {
	lastSource: KEEP_ONE_SOURCE_MESSAGE,
	failed: "That didn't go through. Try again.",
}

// the dialog that confirms removing a Source from the topic, then removes it and reloads the topic page
function RemoveTopicSourceDialog({
	topicId,
	topicSource,
	onTopicSourceRemoved,
	onClose,
}: {
	topicId: string
	topicSource: RemovableTopicSource
	onTopicSourceRemoved: () => Promise<void>
	onClose: () => void
}) {
	// remove the Source and close the dialog. on success reload the topic page, or else toast why the Source stayed
	const handleRemoveTopicSource = async (): Promise<void> => {
		const removeTopicSourceStatus = await removeTopicSource(topicId, topicSource.sourceId).catch(
			(): RemoveTopicSourceStatus => "failed",
		)
		onClose()
		if (removeTopicSourceStatus === "removed") {
			await onTopicSourceRemoved()
			return
		}
		toast.error(TOPIC_SOURCE_REMOVAL_MESSAGES[removeTopicSourceStatus])
	}
	return (
		<ConfirmDialog
			title="Remove this source?"
			confirmLabel="Remove source"
			cancelLabel="Keep it"
			onConfirm={handleRemoveTopicSource}
			onClose={onClose}
		>
			{/* the Source's name in bold on one line, cut short if it is too long for the dialog */}
			Carl stops reading{" "}
			<span className="inline-block max-w-full truncate align-bottom font-semibold">{topicSource.label}</span> on later
			brews. Past brews keep what it found.
		</ConfirmDialog>
	)
}

// the timestamp for a scan row. a running scan only has its start time
function toScanTimestamp(scan: TopicScan): string {
	const scannedAt = scan.finishedAt ?? scan.startedAt
	const time = new Date(scannedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()
	return `${toMonthDayLabel(scannedAt)} · ${time}`
}
