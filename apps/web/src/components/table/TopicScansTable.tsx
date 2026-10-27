import type { ActivityScan, OwnerTopic } from "@carlnotes/contracts/activity"
import { DataTable } from "@carlnotes/core/components/DataTable"
import { durationMsBetween, toDurationLabel } from "@carlnotes/core/lib/labels"
import { scanSortValues, toTopicScansTableColumns } from "@carlnotes/core/lib/topicScansTableColumns"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { TopicScanRecap, toNotesMarkdown } from "@/components/topic/TopicScanRecap"
import { useScanNote } from "@/hooks/useScanNote"
import { POPOVER_PANEL_CLASS, STANDALONE_LINK_CLASS, SUBTABLE_CARD_CLASS } from "@/lib/styleClasses"
import { DATA_TABLE_ELEMENTS } from "./DataTable"
import { TableCard } from "./TableCard"
import { TablePagination, usePaginatedRowSort } from "./TablePagination"

/**
 * Shows the shared brew history columns with web recap popovers.
 */
export function TopicScansTable({
	scans,
	topic,
}: {
	scans: OwnerTopic["scans"]
	topic: Pick<OwnerTopic, "id" | "name">
}) {
	// sort and page the same rows as the native table
	const { pageRows, sort, pagination } = usePaginatedRowSort({ rows: scans, valueByKey: scanSortValues })
	const columns = toTopicScansTableColumns({
		scans,
		renderText: (text) => <span>{text}</span>,
		renderTime: (scan) => <ScanNotesCell scan={scan} topic={topic} />,
	})
	if (!scans.length) {
		return (
			<TableCard className={SUBTABLE_CARD_CLASS}>
				<p className="text-muted-foreground text-sm">No brews this month.</p>
			</TableCard>
		)
	}
	return (
		<TableCard className={SUBTABLE_CARD_CLASS}>
			<DataTable
				columns={columns}
				renderedRows={pageRows.map((row) => ({ row }))}
				getRowId={(scan) => scan.id}
				sort={sort}
				elements={DATA_TABLE_ELEMENTS}
			/>
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
