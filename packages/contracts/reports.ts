// the report contracts: what a user can report, a report as the admin console lists it, and how one is resolved
import { z } from "zod"
import { reportResolutions, reportSubjectKinds } from "./enums"
import { NOTE_COMMENT_MAX_CHARS } from "./notes"
import { userIdentity } from "./profiles"
import { toCutText } from "./text"
import { topicImageUrls } from "./topicImages"

export type ReportSubjectKind = (typeof reportSubjectKinds)[number]

// the report subject kinds whose content Remove and Block both remove from the console, where removing a topic's or a
// topic post's image renders a new one, and removing a body image takes it out of its post. Remove alone resets a
// reported profile's or team's avatar and renders a reported podcast episode's image again. a Topic or a Finding is
// cleared or acted on through the console's own tools
export const REMOVABLE_REPORT_SUBJECT_KINDS: ReadonlySet<ReportSubjectKind> = new Set([
	"chatMessage",
	"note",
	"noteComment",
	"comment",
	"topicImage",
	"topicPostImage",
	"topicPostBodyImage",
])

/**
 * Returns whether a report's subject is an image: a Topic's, a Topic Post's, or one in a Topic Post's body.
 */
export function isImageReportSubjectKind(subjectKind: ReportSubjectKind): boolean {
	return subjectKind === "topicImage" || subjectKind === "topicPostImage" || subjectKind === "topicPostBodyImage"
}

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
	topicImage: "topic image",
	topicPostImage: "topic post image",
	topicPostBodyImage: "topic post body image",
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
	// the reported image as it stands: a topic's, a topic post's, a body image, or a podcast episode's own
	subjectImage: topicImageUrls.nullable(),
	// the version that the url of a reported profile's or team's published avatar names, null if it has none
	subjectAvatarVersion: z.string().nullable().default(null),
	// the poster of a reported podcast episode's film, null for a film with no image of its own
	topicPodcastEpisodeVideoPosterUrl: z.string().nullable().default(null),
	reason: z.string(),
	createdAt: z.string(),
	// the author, null for a subject with none or whose account closed, and who filed the report
	author: userIdentity.nullable(),
	reporter: userIdentity,
	// whether the console offers Remove for this report's subject, and whether the subject was already deleted
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
