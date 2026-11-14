import { sendReportResolution } from "@carlnotes/client/reportClient"
import { toAvatarImagePath, toTeamAvatarImagePath } from "@carlnotes/contracts/avatars"
import { DEFAULT_PAGE_SIZE } from "@carlnotes/contracts/pagination"
import {
	type AdminReport,
	isImageReportSubjectKind,
	REMOVABLE_REPORT_SUBJECT_KINDS,
	REPORT_SUBJECT_KIND_LABELS,
	type ReportResolution,
	type ReportSubjectKind,
} from "@carlnotes/contracts/reports"
import { toProfilePath } from "@carlnotes/contracts/seo"
import { toTopicPodcastEpisodeVideoImageUrls } from "@carlnotes/contracts/topicImages"
import type { ConfirmationCopy } from "@carlnotes/core/lib/confirmationCopy"
import { toDateLabel } from "@carlnotes/core/lib/labels"
import { SAVE_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { cn } from "@carlnotes/nightshift/classNames"
import { useState } from "react"
import { toast } from "sonner"
import { Avatar } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ScrollBox } from "@/components/common/ScrollBox"
import { Button } from "@/components/primitives/button"
import { TopicImageLink } from "@/components/topic/TopicImageLink"
import { useConfirmDialog } from "@/hooks/useConfirmDialog"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/tableClasses"
import { SortableHeader } from "./SortableHeader"
import { EmptyListCard, TableCard } from "./TableCard"
import { TablePagination, usePaginatedRowSort } from "./TablePagination"

// each subject kind's label with its first letter raised, as the table's column reads
const SUBJECT_KIND_COLUMN_LABELS = Object.fromEntries(
	Object.entries(REPORT_SUBJECT_KIND_LABELS).map(([subjectKind, label]) => [
		subjectKind,
		label.charAt(0).toUpperCase() + label.slice(1),
	]),
) as Record<AdminReport["subjectKind"], string>

// how long a report's text runs before it scrolls inside a box, about what the box shows at once
const SCROLLING_REPORT_TEXT_CHARS = 300

// the owner of each image that Remove draws again, as its confirmation names it
const REGENERATED_IMAGE_OWNERS: Partial<Record<ReportSubjectKind, string>> = {
	topicImage: "topic",
	topicPostImage: "post",
	podcastEpisode: "podcast episode",
}

// what Remove's button and its confirmation say for one report
type RemoveCopy = { label: string; pendingLabel: string; title: string; clause: string }

// the sort accessors for the reports table columns
const reportSortValues = {
	reported: (report: AdminReport) => report.createdAt,
	kind: (report: AdminReport) => report.subjectKind,
	author: (report: AdminReport) => report.author?.username ?? "",
	reporter: (report: AdminReport) => report.reporter.username,
}

/**
 * The admin console's open reports, newest first, each with its text, its avatar or images, its people, its reason,
 * and the three resolutions, each confirmed first: Remove deletes the content through its own delete path, resets an
 * avatar, or draws an image again, Block sets an admin block, deletes the content too, and hides everything else its
 * author wrote in reactions and comments, and Clear closes the report.
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
	const { pageRows, sort, pagination } = usePaginatedRowSort({
		rows: orderedReports,
		valueByKey: reportSortValues,
		initialPageSize: DEFAULT_PAGE_SIZE,
	})
	if (reports.length === 0) {
		return <EmptyListCard>No open reports. Carl is relieved.</EmptyListCard>
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

// a report cell's text. only text long enough to overflow gets the scroll box's border and scrollbar
function ReportText({ text }: { text: string }) {
	return text.length > SCROLLING_REPORT_TEXT_CHARS ? <ScrollBox className="max-h-40">{text}</ScrollBox> : text
}

// a report's avatar or images as they stand, above its text: a profile's or a team's published avatar, a reported
// image, or a podcast episode's own image beside its film's poster. an image opens the page the report's kind links to
function ReportSubjectImages({ report }: { report: AdminReport }) {
	// a published avatar at its own url, named by the first line of the text: a username, or a team's name
	if (report.subjectAvatarVersion) {
		const avatarImagePath =
			report.subjectKind === "team"
				? toTeamAvatarImagePath(report.subjectId, report.subjectAvatarVersion)
				: toAvatarImagePath(report.subjectId, report.subjectAvatarVersion)
		return (
			<Avatar
				imageUrl={avatarImagePath}
				ownerId={report.subjectId}
				name={report.subjectText.split("\n", 1)[0] ?? ""}
				className="mb-1 block size-16"
			/>
		)
	}

	// an image report shows its image even before one is drawn, and a podcast episode its own image and its film's
	const hasSubjectImage = isImageReportSubjectKind(report.subjectKind) || report.subjectImage !== null
	const { topicPodcastEpisodeVideoPosterUrl } = report
	if (!hasSubjectImage && !topicPodcastEpisodeVideoPosterUrl) {
		return null
	}
	return (
		<div className="mb-1 flex flex-wrap gap-2">
			{/* the reported image, or the podcast episode's own */}
			{hasSubjectImage && (
				<TopicImageLink image={report.subjectImage} size="list" name={report.subjectText} path={report.subjectPath} />
			)}
			{/* the film's poster */}
			{topicPodcastEpisodeVideoPosterUrl && (
				<TopicImageLink
					image={toTopicPodcastEpisodeVideoImageUrls(topicPodcastEpisodeVideoPosterUrl)}
					size="list"
					name={`the film of ${report.subjectText}`}
					path={report.subjectPath}
				/>
			)}
		</div>
	)
}

// what Remove does to a report's subject: a profile's or a team's avatar is reset, a body image is taken out of its
// post, a topic's, a topic post's, or a podcast episode's image is drawn again, and every other kind is deleted
function toRemoveCopy({ subjectKind }: AdminReport): RemoveCopy {
	if (subjectKind === "profile" || subjectKind === "team") {
		return {
			label: "Reset avatar",
			pendingLabel: "Resetting…",
			title: "Reset this avatar?",
			clause: `returns the ${subjectKind} to its initials`,
		}
	}
	if (subjectKind === "topicPostBodyImage") {
		return {
			label: "Remove",
			pendingLabel: "Removing…",
			title: "Remove this image?",
			clause: "takes the image out of the post",
		}
	}

	// an image that is drawn again names its owner
	const imageOwner = REGENERATED_IMAGE_OWNERS[subjectKind]
	if (imageOwner) {
		return {
			label: "Regenerate",
			pendingLabel: "Regenerating…",
			title: "Regenerate this image?",
			clause: `draws a new image for the ${imageOwner}`,
		}
	}
	return { label: "Remove", pendingLabel: "Removing…", title: "Remove this content?", clause: "deletes the content" }
}

// what each resolution's confirmation says. Block names the author, and only content still there is deleted or kept
function toResolutionConfirmation(
	resolution: ReportResolution,
	report: AdminReport,
): Omit<ConfirmationCopy, "cancelLabel"> {
	const removeCopy = toRemoveCopy(report)
	if (resolution === "removed") {
		// a podcast episode's Regenerate also draws its film's image again if that image is an upload
		const topicPodcastEpisodeVideoSentence = report.topicPodcastEpisodeVideoPosterUrl
			? " The film's image is drawn again too if it was uploaded."
			: ""
		return {
			title: removeCopy.title,
			confirmLabel: removeCopy.label,
			children: `This ${removeCopy.clause} and closes the report.${topicPodcastEpisodeVideoSentence}`,
		}
	}

	// Block deletes content of a removable kind that is still there, and leaves an avatar and a podcast episode's images
	if (resolution === "blocked") {
		const willBlockDeleteSubject = REMOVABLE_REPORT_SUBJECT_KINDS.has(report.subjectKind) && !report.isSubjectDeleted
		return {
			title: `Block ${report.author?.username ?? "this author"}?`,
			confirmLabel: "Block",
			children: `This ${willBlockDeleteSubject ? `${removeCopy.clause}, hides everything else they wrote` : "hides everything they wrote"} in hot takes and reactions, and stops new ones until an admin clears the block.`,
		}
	}
	return {
		title: "Clear this content?",
		confirmLabel: "Clear",
		children: report.isSubjectDeleted
			? "This closes the report."
			: "This closes the report and leaves the content in place.",
	}
}

// one report row: when and what, the text as reported, both people linked, the reason, and Clear, Remove, or Block
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
	const { confirm, confirmDialog } = useConfirmDialog()

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

	// each resolution asks first
	function handleResolvePress(resolution: ReportResolution): void {
		confirm({ ...toResolutionConfirmation(resolution, report), cancelLabel: "Cancel" }, () => handleResolve(resolution))
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
					<>
						{/* the avatar or the images as they stand, above the subject's text */}
						<ReportSubjectImages report={report} />
						<ReportText text={report.subjectText} />
					</>
				)}
			</td>
			<td className="py-2 pr-4 whitespace-nowrap">
				{report.author ? (
					<AnchorLink href={toProfilePath(report.author.id)} className={STANDALONE_LINK_CLASS}>
						{report.author.username}
					</AnchorLink>
				) : (
					<span className="text-muted-foreground">none</span>
				)}
			</td>
			<td className="py-2 pr-4 whitespace-nowrap">
				<AnchorLink href={toProfilePath(report.reporter.id)} className={STANDALONE_LINK_CLASS}>
					{report.reporter.username}
				</AnchorLink>
			</td>
			<td className="max-w-xs py-2 pr-4 whitespace-pre-wrap break-words">
				{report.reason ? (
					<ReportText text={report.reason} />
				) : (
					<span className="text-muted-foreground">none given</span>
				)}
			</td>
			<td className="py-2 whitespace-nowrap">
				<div className="flex gap-2">
					{report.canRemove && !report.isSubjectDeleted && (
						<Button
							variant="destructive"
							size="sm"
							disabled={pendingResolution !== null}
							onClick={() => handleResolvePress("removed")}
						>
							{pendingResolution === "removed" ? toRemoveCopy(report).pendingLabel : toRemoveCopy(report).label}
						</Button>
					)}
					{report.canAdminBlock && (
						<Button
							variant="destructive"
							size="sm"
							disabled={pendingResolution !== null}
							onClick={() => handleResolvePress("blocked")}
						>
							{pendingResolution === "blocked" ? "Blocking…" : "Block"}
						</Button>
					)}
					<Button
						variant="outline"
						size="sm"
						disabled={pendingResolution !== null}
						onClick={() => handleResolvePress("cleared")}
					>
						{pendingResolution === "cleared" ? "Clearing…" : "Clear"}
					</Button>
				</div>
				{confirmDialog}
			</td>
		</tr>
	)
}
