import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import { toReportedNoteCommentLabel } from "./noteLabels"
import { toReportedCommentLabel } from "./socialLabels"

// the report dialog's words on both apps: the title, the question, the controls, and what a sent report says
export const REPORT_DIALOG_COPY = {
	question: "What is wrong with it? A reason helps but it is optional.",
	reasonLabel: "Why you are reporting this",
	cancel: "Cancel",
	send: "Send report",
	sending: "Sending…",
	sent: "Thanks for your report. Someone will take a look.",
	sentWithUserBlock: "Thanks for your report. Someone will take a look. The author is blocked.",
	failed: "The report did not send. Try again.",
	removed: "Report removed.",
	removeFailed: "The report was not removed. Try again.",
} as const

// how each kind of comment reads as a report's subject, by its author's name
const REPORTED_COMMENT_LABELS = { comment: toReportedCommentLabel, noteComment: toReportedNoteCommentLabel }
type ReportedCommentKind = keyof typeof REPORTED_COMMENT_LABELS

// what the report dialog names for a comment: the comment and its author
type CommentReportProps = {
	subjectKind: ReportedCommentKind
	subjectId: string
	subjectLabel: string
	author: { id: string; username: string }
}

/**
 * Returns the report dialog's title for a subject's label.
 */
export function toReportDialogTitle(subjectLabel: string): string {
	return `Report an issue with ${subjectLabel}`
}

/**
 * Returns the report dialog's subject and author for a comment, or null for a comment with no author to report.
 */
export function toCommentReportProps(
	subjectKind: ReportedCommentKind,
	{ id, author }: { id: string; author: ProfileIdentity | null },
): CommentReportProps | null {
	if (!author) {
		return null
	}
	return {
		subjectKind,
		subjectId: id,
		subjectLabel: REPORTED_COMMENT_LABELS[subjectKind](author.username),
		author: { id: author.userId, username: author.username },
	}
}
