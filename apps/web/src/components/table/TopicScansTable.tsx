import type { ActivityScan, OwnerTopic } from "@carlnotes/contracts/activity"
import { durationMsBetween, toCentsLabel, toDateLabel, toDurationLabel } from "@carlnotes/core/lib/labels"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { TopicScanRecap, toNotesMarkdown } from "@/components/topic/TopicScanRecap"
import { useScanNote } from "@/hooks/useScanNote"
import {
	POPOVER_PANEL_CLASS,
	STANDALONE_LINK_CLASS,
	SUBTABLE_CARD_CLASS,
	TABLE_CLASS,
	TABLE_HEAD_CLASS,
	TABLE_SCROLL_CLASS,
} from "@/lib/styleClasses"
import { SortableHeader } from "./SortableHeader"
import { TableCard } from "./TableCard"
import { TablePagination, usePaginatedRowSort } from "./TablePagination"

// the sort accessors for a topic's scans-this-month columns. time sorts by how long the scan took
const scanSortValues = {
	date: (scan: ActivityScan) => new Date(scan.startedAt).getTime(),
	read: (scan: ActivityScan) => scan.foundCount,
	kept: (scan: ActivityScan) => scan.keptCount,
	time: (scan: ActivityScan) => durationMsBetween(scan.startedAt, scan.finishedAt),
	cost: (scan: ActivityScan) => scan.costCents,
}

/** A topic's scans this month as a sortable, paged table with a totals line. A scan's time opens its recap. */
export function TopicScansTable({
	scans,
	topic,
}: {
	scans: OwnerTopic["scans"]
	topic: Pick<OwnerTopic, "id" | "name">
}) {
	const { pageRows, sort, pagination } = usePaginatedRowSort({ rows: scans, valueByKey: scanSortValues })

	if (scans.length === 0) {
		return (
			<TableCard className={SUBTABLE_CARD_CLASS}>
				<p className="text-muted-foreground text-sm">No brews this month.</p>
			</TableCard>
		)
	}

	// column totals for the summary line span every scan, not just the visible page
	const totalFoundCount = scans.reduce((sum, scan) => sum + scan.foundCount, 0)
	const totalKeptCount = scans.reduce((sum, scan) => sum + scan.keptCount, 0)
	const totalCostCents = scans.reduce((sum, scan) => sum + scan.costCents, 0)
	return (
		<TableCard className={SUBTABLE_CARD_CLASS}>
			<div className={TABLE_SCROLL_CLASS}>
				<table className={TABLE_CLASS}>
					<thead className={TABLE_HEAD_CLASS}>
						<tr>
							<SortableHeader sort={sort} sortKey="date" label="Date" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="read" label="Read" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="kept" label="Kept" className="py-2 pr-4" />
							<SortableHeader
								sort={sort}
								sortKey="time"
								label="Brew time"
								tooltip="How long each brew took. Click a time for Carl's notes"
								className="py-2 pr-4"
							/>
							<SortableHeader sort={sort} sortKey="cost" label="Cost" className="py-2 text-right" />
						</tr>
					</thead>
					<tbody>
						{pageRows.map((scan) => (
							<tr key={scan.id} className="border-b">
								<td className="py-2 pr-4">{toDateLabel(scan.startedAt)}</td>
								<td className="py-2 pr-4">{scan.foundCount}</td>
								<td className="py-2 pr-4">{scan.keptCount}</td>
								<td className="py-2 pr-4">
									<ScanNotesCell scan={scan} topic={topic} />
								</td>
								<td className="py-2 text-right">{toCentsLabel(scan.costCents)}</td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr className="text-muted-foreground">
							<td className="py-2 pr-4">Total</td>
							<td className="py-2 pr-4">{`${totalFoundCount} read`}</td>
							<td className="py-2 pr-4">{`${totalKeptCount} kept`}</td>
							<td className="py-2 pr-4" />
							<td className="py-2 text-right">{toCentsLabel(totalCostCents)}</td>
						</tr>
					</tfoot>
				</table>
			</div>
			<TablePagination {...pagination} />
		</TableCard>
	)
}

// the Brew time cell, the time taken as a link that opens the scan recap popover
function ScanNotesCell({ scan, topic }: { scan: ActivityScan; topic: Pick<OwnerTopic, "id" | "name"> }) {
	const duration = toDurationLabel(durationMsBetween(scan.startedAt, scan.finishedAt))
	// the scan's note, read as soon as the pointer, focus, or a touch reaches the time, and on open
	const { scanNote, scanNoteTriggerProps, handleScanNoteOpenChange } = useScanNote(scan)
	return (
		<Popover onOpenChange={handleScanNoteOpenChange}>
			<PopoverTrigger {...scanNoteTriggerProps} className={STANDALONE_LINK_CLASS}>
				{duration || "—"}
			</PopoverTrigger>
			<PopoverContent align="start" className={POPOVER_PANEL_CLASS}>
				<PopoverCloseButton />
				{scanNote ? (
					<TopicScanRecap
						scan={{ ...scan, ...scanNote, costDollars: scan.costCents / 100 }}
						copyMarkdown={toNotesMarkdown({ topicId: topic.id, topicName: topic.name, note: scanNote.scanSummary })}
					/>
				) : (
					<CoffeeLoading className="min-h-24 text-base" />
				)}
			</PopoverContent>
		</Popover>
	)
}
