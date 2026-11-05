// report delivery builds server links outside the previewable template
import { appUrl } from "@carlnotes/server/appUrl"
import { sendEmail } from "./email"
import { type ReportEmailProps, renderReportEmail, renderReportEmailText, toReportEmailSubject } from "./report-email"

// what a send needs: the inbox, the report's id and its subject's page for the links, and the words
export type SendReportEmailOptions = Omit<ReportEmailProps, "subjectUrl" | "reportUrl" | "appUrl"> & {
	to: string
	reportId: string
	subjectPath: string
}

/**
 * Mails one report, or the reminder for one, to the support inbox with the links built from the app url, and returns
 * whether the mailer accepted it.
 */
export async function sendReportEmail({
	to,
	reportId,
	subjectPath,
	...words
}: SendReportEmailOptions): Promise<boolean> {
	const reportEmailProps: ReportEmailProps = {
		...words,
		subjectUrl: `${appUrl()}${subjectPath}`,
		reportUrl: `${appUrl()}/admin?report=${encodeURIComponent(reportId)}`,
		appUrl: appUrl(),
	}
	return sendEmail({
		to,
		subject: toReportEmailSubject(reportEmailProps),
		emailContent: await renderReportEmail(reportEmailProps),
		plainTextContent: await renderReportEmailText(reportEmailProps),
		emailKind: "flag-content",
	})
}
