// the report contracts: what a user can report, a report as the admin console lists it, and how one is resolved
import { z } from "zod"
import { reportResolutions, reportSubjectKinds } from "./enums"
import { NOTE_COMMENT_MAX_CHARS } from "./notes"
import { userIdentity } from "./profiles"

export type ReportSubjectKind = (typeof reportSubjectKinds)[number]

// the report subject kinds an admin removes from the console. a Topic, profile, or Team is kept or acted on through
// the console's own tools
export const REMOVABLE_REPORT_SUBJECT_KINDS: ReadonlySet<ReportSubjectKind> = new Set([
	"chatMessage",
	"note",
	"noteComment",
])

export type ReportResolution = (typeof reportResolutions)[number]

// how each subject kind reads in a sentence, in the report email and the admin console
export const REPORT_SUBJECT_KIND_LABELS: Record<ReportSubjectKind, string> = {
	topic: "topic",
	profile: "profile",
	team: "team",
	chatMessage: "chat message",
	note: "note",
	noteComment: "note comment",
}

// how much of the subject's text a report keeps. a note body is cut to this length
export const REPORT_TEXT_MAX_CHARS = NOTE_COMMENT_MAX_CHARS

// an open report as the admin console lists it
export const adminReport = z.object({
	id: z.string(),
	subjectKind: z.enum(reportSubjectKinds),
	subjectId: z.string(),
	// the subject's text when it was reported, and the page that held it
	subjectText: z.string(),
	subjectPath: z.string(),
	reason: z.string(),
	createdAt: z.string(),
	// the author, null for a subject with none or whose account closed, and who filed the report
	author: userIdentity.nullable(),
	reporter: userIdentity,
	// whether the console offers Remove for this kind, and whether the subject was already deleted
	canRemove: z.boolean(),
	isSubjectDeleted: z.boolean(),
})

export type AdminReport = z.infer<typeof adminReport>

// the admin console's open reports
export const adminReportsResponse = z.object({ reports: z.array(adminReport) })

export type AdminReportsResponse = z.infer<typeof adminReportsResponse>

// the body that resolves a report
export const resolveReportPayload = z.object({ resolution: z.enum(reportResolutions) })

export type ResolveReportPayload = z.infer<typeof resolveReportPayload>

/**
 * Returns the subject's text cut to what a report keeps.
 */
export function toReportText(text: string): string {
	return text.length > REPORT_TEXT_MAX_CHARS ? `${text.slice(0, REPORT_TEXT_MAX_CHARS - 1)}…` : text
}
