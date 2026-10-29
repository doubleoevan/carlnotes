import { sendReportResolution } from "@carlnotes/client/reportClient"
import { type AdminReport, REPORT_SUBJECT_KIND_LABELS, type ReportResolution } from "@carlnotes/contracts/reports"
import { toDateLabel } from "@carlnotes/core/lib/labels"
import { SAVE_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { cn } from "@carlnotes/nightshift/classNames"
import { useState } from "react"
import { toast } from "sonner"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { STANDALONE_LINK_CLASS, TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { SortableHeader } from "./SortableHeader"
import { TableCard } from "./TableCard"
import { TablePagination, usePaginatedRowSort } from "./TablePagination"

// each subject kind's label with its first letter raised, as the table's column reads
const SUBJECT_KIND_COLUMN_LABELS = Object.fromEntries(
	Object.entries(REPORT_SUBJECT_KIND_LABELS).map(([subjectKind, label]) => [
		subjectKind,
		label.charAt(0).toUpperCase() + label.slice(1),
	]),
) as Record<AdminReport["subjectKind"], string>

// the sort accessors for the reports table columns
const reportSortValues = {
	reported: (report: AdminReport) => report.createdAt,
	kind: (report: AdminReport) => report.subjectKind,
	author: (report: AdminReport) => report.author?.username ?? "",
	reporter: (report: AdminReport) => report.reporter.username,
}

/**
 * The admin console's open reports, newest first, each with its text, its people, its reason, and the two
 * resolutions: Remove deletes the content through its own delete path, and Keep closes the report.
 */
export function AdminReportsTable({
	reports,
	focusedReportId,
	onResolved,
}: {
	reports: AdminReport[]
	// the report the email linked to, shown first and highlighted
	focusedReportId: string | null
	onResolved: () => void
}) {
	// the linked report sorts to the top, then the rest newest first
	const orderedReports = focusedReportId
		? [...reports].sort((first, second) => Number(second.id === focusedReportId) - Number(first.id === focusedReportId))
		: reports
	const { pageRows, sort, pagination } = usePaginatedRowSort({ rows: orderedReports, valueByKey: reportSortValues })
	if (reports.length === 0) {
		return <p className="text-muted-foreground text-sm">No open reports. Carl is relieved.</p>
	}
	return (
		<TableCard>
			<div className={TABLE_SCROLL_CLASS}>
				<table className={cn(TABLE_CLASS, "min-w-3xl [&_tbody_tr:last-child>*]:border-b-0")}>
					<thead className={TABLE_HEAD_CLASS}>
						<tr>
							<SortableHeader sort={sort} sortKey="reported" label="Reported" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="kind" label="Kind" className="py-2 pr-4" />
							<th className="py-2 pr-4 text-left font-normal">Text</th>
							<SortableHeader sort={sort} sortKey="author" label="Author" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="reporter" label="Reporter" className="py-2 pr-4" />
							<th className="py-2 pr-4 text-left font-normal">Reason</th>
							<th className="py-2 text-left font-normal">Resolution</th>
						</tr>
					</thead>
					<tbody>
						{pageRows.map((report) => (
							<ReportRow
								key={report.id}
								report={report}
								isFocused={report.id === focusedReportId}
								onResolved={onResolved}
							/>
						))}
					</tbody>
				</table>
			</div>
			<TablePagination {...pagination} />
		</TableCard>
	)
}

// one report row: when and what, the text as reported, both people linked, the reason, and Keep or Remove
function ReportRow({
	report,
	isFocused,
	onResolved,
}: {
	report: AdminReport
	isFocused: boolean
	onResolved: () => void
}) {
	const [pendingResolution, setPendingResolution] = useState<ReportResolution | null>(null)

	// resolve the report, then reload the list. a failure keeps the row and says so
	async function handleResolve(resolution: ReportResolution): Promise<void> {
		setPendingResolution(resolution)
		try {
			await sendReportResolution(report.id, resolution)
			onResolved()
		} catch {
			toast.error(SAVE_FAILED_TEXT)
			setPendingResolution(null)
		}
	}
	return (
		<tr id={`report-${report.id}`} className={cn("border-b align-top", isFocused && "bg-accent/40")}>
			<td className="py-2 pr-4 whitespace-nowrap">{toDateLabel(report.createdAt)}</td>
			<td className="py-2 pr-4 whitespace-nowrap">
				<AnchorLink href={report.subjectPath} className={STANDALONE_LINK_CLASS}>
					{SUBJECT_KIND_COLUMN_LABELS[report.subjectKind]}
				</AnchorLink>
			</td>
			<td className="max-w-md py-2 pr-4 whitespace-pre-wrap break-words">
				{report.isSubjectDeleted ? (
					<span className="text-muted-foreground italic">already deleted</span>
				) : (
					report.subjectText
				)}
			</td>
			<td className="py-2 pr-4 whitespace-nowrap">
				{report.author ? (
					<AnchorLink href={`/profiles/${report.author.id}`} className={STANDALONE_LINK_CLASS}>
						{report.author.username}
					</AnchorLink>
				) : (
					<span className="text-muted-foreground">none</span>
				)}
			</td>
			<td className="py-2 pr-4 whitespace-nowrap">
				<AnchorLink href={`/profiles/${report.reporter.id}`} className={STANDALONE_LINK_CLASS}>
					{report.reporter.username}
				</AnchorLink>
			</td>
			<td className="max-w-xs py-2 pr-4 whitespace-pre-wrap break-words">
				{report.reason || <span className="text-muted-foreground">none given</span>}
			</td>
			<td className="py-2 whitespace-nowrap">
				<div className="flex gap-2">
					{report.canRemove && !report.isSubjectDeleted && (
						<Button
							variant="destructive"
							size="sm"
							disabled={pendingResolution !== null}
							onClick={() => void handleResolve("removed")}
						>
							{pendingResolution === "removed" ? "Removing…" : "Remove"}
						</Button>
					)}
					<Button
						variant="outline"
						size="sm"
						disabled={pendingResolution !== null}
						onClick={() => void handleResolve("kept")}
					>
						{pendingResolution === "kept" ? "Keeping…" : "Keep"}
					</Button>
				</div>
			</td>
		</tr>
	)
}
