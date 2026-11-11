import { useSubjectReportFlag } from "@carlnotes/core/hooks/useSubjectReport"
import { toReportImageLabel } from "@carlnotes/core/lib/socialLabels"
import { cn } from "@carlnotes/nightshift/classNames"
import { Flag } from "lucide-react"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog.tsx"
import { ACTIVE_ICON_CLASS, MENU_DIVIDER_CLASS } from "@/lib/styleClasses"
import { SHARE_OPTION_CLASS } from "./ShareOptions"

// what the share menu reports: the topic itself, or its image
export type ReportedTopicSubjectKind = "topic" | "topicImage"

/**
 * The share menu's report options under their divider. The topic's report option shows on the feed card's icon alone,
 * and the image's shows on both.
 */
export function ReportTopicOptions({
	topicId,
	isIcon,
	onReport,
}: {
	topicId: string
	isIcon?: boolean
	onReport: (subjectKind: ReportedTopicSubjectKind) => void
}) {
	return (
		<>
			<div className={MENU_DIVIDER_CLASS} />
			{isIcon && <ReportTopicOption topicId={topicId} subjectKind="topic" onClick={() => onReport("topic")} />}
			<ReportTopicOption topicId={topicId} subjectKind="topicImage" onClick={() => onReport("topicImage")} />
		</>
	)
}

/**
 * The report dialog for a topic or its image, mounted while a report option's subject is set.
 */
export function ReportTopicDialog({
	topic,
	subjectKind,
	onClose,
}: {
	topic: { id: string; name: string }
	subjectKind: ReportedTopicSubjectKind | null
	onClose: () => void
}) {
	if (!subjectKind) {
		return null
	}
	return (
		<ReportIssueDialog
			subjectKind={subjectKind}
			subjectId={topic.id}
			subjectLabel={subjectKind === "topicImage" ? `the image of ${topic.name}` : topic.name}
			onClose={onClose}
		/>
	)
}

// the share menu's report option for the topic or its image, which reads whether the user reported it as the menu opens
function ReportTopicOption({
	topicId,
	subjectKind,
	onClick,
}: {
	topicId: string
	subjectKind: ReportedTopicSubjectKind
	onClick: () => void
}) {
	const reportFlag = useSubjectReportFlag({ subjectKind, subjectId: topicId }, onClick)
	return (
		<button type="button" onClick={reportFlag.press} className={SHARE_OPTION_CLASS}>
			<Flag className={cn("size-4", reportFlag.isReported && ACTIVE_ICON_CLASS)} />
			{subjectKind === "topicImage" ? toReportImageLabel(reportFlag.isReported) : reportFlag.label}
		</button>
	)
}
