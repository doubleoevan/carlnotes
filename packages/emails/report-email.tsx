// the email a report sends to the support inbox, and the one reminder for a report left open: what was reported, by
// whom, the text as it stood, the reason, and the link into the admin console

import { REPORT_SUBJECT_KIND_LABELS, type ReportSubjectKind } from "@carlnotes/contracts/reports"
import { SITE_URL } from "@carlnotes/contracts/site"
import { Link } from "@react-email/components"
import { render } from "@react-email/render"
import type { ReactElement } from "react"
import AuthEmail, { type AuthEmailProps } from "./auth-email"
import { summaryLink } from "./emailShell"

export type ReportEmailProps = {
	subjectKind: ReportSubjectKind
	// the subject's name for the subject line, the page that holds it, and its text when it was reported
	subjectLabel: string
	subjectUrl: string
	subjectText: string
	// the author's username, null for a subject with none or whose account closed
	authorUsername: string | null
	reporterUsername: string
	reason: string
	// the report in the admin console
	reportUrl: string
	// whether this is the sweep's reminder for a report still open
	isReminder: boolean
	appUrl?: string
}

/**
 * Returns the report's subject line.
 */
export function toReportEmailSubject({ subjectKind, subjectLabel, isReminder }: ReportEmailProps): string {
	const subjectLine = `${REPORT_SUBJECT_KIND_LABELS[subjectKind]} reported: ${subjectLabel}`
	return isReminder ? `Still open: ${subjectLine}` : `Reported: ${subjectLine}`
}

// the report's words for the shared one-link template. the lead names the kind, the reporter, and the author, and the
// link note holds the reason and the text as it stood
function toAuthEmailProps(props: ReportEmailProps): AuthEmailProps {
	const { subjectKind, subjectLabel, subjectUrl, subjectText, authorUsername, reporterUsername, reason } = props
	const kindLabel = REPORT_SUBJECT_KIND_LABELS[subjectKind]
	const leadStart = `${reporterUsername} reported the ${kindLabel} `
	const leadEnd = authorUsername ? ` by ${authorUsername}.` : "."
	return {
		heading: props.isReminder ? "A report is still open" : "Content reported",
		lead: `${leadStart}${subjectLabel}${leadEnd}`,
		leadContent: (
			<>
				{leadStart}
				<Link href={subjectUrl} style={summaryLink}>
					{subjectLabel}
				</Link>
				{leadEnd}
			</>
		),
		buttonLabel: "Open the report",
		url: props.reportUrl,
		linkNote: `Reason: ${reason || "none given"} Text as reported: ${subjectText}`,
		closingNote: props.isReminder
			? "This report has waited twelve hours. Aim to respond within a day."
			: "Remove the content or keep it from the console. The reporter no longer sees it either way.",
		appUrl: props.appUrl,
	}
}

/**
 * Applies the single link template with the report's words.
 * @public The dev:email preview renders each template's default export by folder.
 */
export default function ReportEmail(props: ReportEmailProps): ReactElement {
	return <AuthEmail {...toAuthEmailProps(props)} />
}

// what `bun run dev:email` renders this template with
ReportEmail.PreviewProps = {
	subjectKind: "chatMessage",
	subjectLabel: "a message from raccoon",
	subjectUrl: `${SITE_URL}/topics/topic-1/raccoons`,
	subjectText: "You all smell like old coffee grounds.",
	authorUsername: "raccoon",
	reporterUsername: "doubleoevan",
	reason: "Insulting the whole room.",
	reportUrl: `${SITE_URL}/admin?report=report-1`,
	isReminder: false,
	appUrl: SITE_URL,
} satisfies ReportEmailProps

// render the template to an HTML string for sending. the api and the sweep call this at send-email time
export function renderReportEmail(props: ReportEmailProps): Promise<string> {
	return render(<ReportEmail {...props} />)
}

// the same email as plain text, sent with the HTML so the message is not html-only
export function renderReportEmailText(props: ReportEmailProps): Promise<string> {
	return render(<ReportEmail {...props} />, { plainText: true })
}
