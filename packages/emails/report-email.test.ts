// report email tests: the subject line names the kind and the subject, the body holds the reporter, the author, the
// reason, the text, and the console link, and the reminder says it is one
import { expect, test } from "bun:test"
import { type ReportEmailProps, renderReportEmail, toReportEmailSubject } from "./report-email"

// a report of one chat message
const reportEmailProps: ReportEmailProps = {
	subjectKind: "chatMessage",
	subjectLabel: "a message from raccoon",
	subjectUrl: "https://carlnotes.com/topics/topic-1/raccoons",
	subjectText: "You all smell like old coffee grounds.",
	authorUsername: "raccoon",
	reporterUsername: "doubleoevan",
	reason: "Insulting the whole room.",
	reportUrl: "https://carlnotes.com/admin?report=report-1",
	isReminder: false,
	appUrl: "https://carlnotes.com",
}

// the subject line and the body name everything the admin needs to act
test("the report email names the subject, the people, the reason, the text, and the console link", async () => {
	expect(toReportEmailSubject(reportEmailProps)).toBe("Reported: chat message reported: a message from raccoon")

	// the body
	const html = await renderReportEmail(reportEmailProps)
	expect(html).toContain("doubleoevan reported the chat message ")
	expect(html).toContain(" by raccoon.")
	expect(html).toContain("Insulting the whole room.")
	expect(html).toContain("You all smell like old coffee grounds.")
	expect(html).toContain("https://carlnotes.com/admin?report=report-1")
})

// the reminder changes the subject line and the heading, and a subject with no author has no author clause
test("the reminder says the report is still open, and a team has no author", async () => {
	const reminderProps: ReportEmailProps = {
		...reportEmailProps,
		subjectKind: "team",
		subjectLabel: "Raccoon Crew",
		authorUsername: null,
		isReminder: true,
	}
	expect(toReportEmailSubject(reminderProps)).toBe("Still open: team reported: Raccoon Crew")
	const html = await renderReportEmail(reminderProps)
	expect(html).toContain("A report is still open")
	expect(html).toContain("reported the team ")
	expect(html).not.toContain(" by raccoon.")
})
