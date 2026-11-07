// the report contracts: what a user can report, a report as the admin console lists it, and how one is resolved
import { z } from "zod"
import { reportResolutions, reportSubjectKinds } from "./enums"
import { NOTE_COMMENT_MAX_CHARS } from "./notes"
import { userIdentity } from "./profiles"
import { toCutText } from "./text"

export type ReportSubjectKind = (typeof reportSubjectKinds)[number]

// the report subject kinds an admin removes from the console. a Topic, profile, Team, Finding, or Podcast Episode is
// cleared or acted on through the console's own tools
export const REMOVABLE_REPORT_SUBJECT_KINDS: ReadonlySet<ReportSubjectKind> = new Set([
	"chatMessage",
	"note",
	"noteComment",
	"comment",
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
	finding: "finding",
	podcastEpisode: "podcast episode",
	comment: "hot take",
}

// how much of the subject's text a report keeps. a note body is cut to this length
export const REPORT_TEXT_MAX_CHARS = NOTE_COMMENT_MAX_CHARS

// an open report as the admin console lists it
const adminReport = z.object({
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
	// whether the subject has an author who is not yet under an admin block
	canAdminBlock: z.boolean().default(false),
})

export type AdminReport = z.infer<typeof adminReport>

// the admin console's open reports
export const adminReportsResponse = z.object({ reports: z.array(adminReport) })

// the open report count
export const adminReportCountResponse = z.object({ openReportCount: z.number().int().nonnegative() })

// whether the signed-in user reported a subject
export const reportedSubjectResponse = z.object({ isReported: z.boolean() })

// the body that resolves a report
export const resolveReportPayload = z.object({ resolution: z.enum(reportResolutions) })

/**
 * Returns the subject's text cut to what a report keeps.
 */
export function toReportText(text: string): string {
	return toCutText(text, REPORT_TEXT_MAX_CHARS)
}
