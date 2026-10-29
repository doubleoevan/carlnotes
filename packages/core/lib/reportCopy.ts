// the report dialog's words on both apps: the title, the question, the controls, and what a sent report says
export const REPORT_DIALOG_COPY = {
	question: "What is wrong with it? A reason helps, and it is optional.",
	reasonLabel: "Why you are reporting this",
	cancel: "Cancel",
	send: "Send report",
	sending: "Sending…",
	sent: "Thanks for your report. Someone will take a look.",
	sentWithBlock: "Thanks for your report. Someone will take a look, and they are blocked.",
	failed: "The report did not send. Try again.",
} as const

/**
 * Returns the report dialog's title for a subject's label.
 */
export function toReportDialogTitle(subjectLabel: string): string {
	return `Report an issue with ${subjectLabel}`
}
