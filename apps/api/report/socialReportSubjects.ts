// what a report of a Finding, a Podcast Episode, or a Comment names, resolved under the rule that lets the reporter
// open its social target
import { toReportText } from "@carlnotes/contracts/reports"
import type { SocialTarget } from "@carlnotes/contracts/social"
import { db } from "@carlnotes/db"
import { comments } from "@carlnotes/db/schema/social"
import { eq } from "drizzle-orm"
import { toRowCommentTarget } from "../social/socialTargetColumns"
import { resolveSocialTarget } from "../social/socialTargets"
import type { ReportedSubject } from "./reportSubjects"

/**
 * Resolves a reported Finding or Podcast Episode, or null if the reporter may not open it. Its name is the text, and
 * the Topic's owner is its author.
 */
export async function toReportedSocialTarget(userId: string, target: SocialTarget): Promise<ReportedSubject | null> {
	const resolvedSocialTarget = await resolveSocialTarget(userId, target)
	if (!resolvedSocialTarget || (target.kind !== "finding" && target.kind !== "podcastEpisode")) {
		return null
	}
	return {
		kind: target.kind,
		id: target.id,
		label: resolvedSocialTarget.label,
		path: resolvedSocialTarget.path,
		text: toReportText(resolvedSocialTarget.label),
		authorUserId: resolvedSocialTarget.topic.ownerId,
	}
}

/**
 * Resolves a reported Comment, or null if the reporter may not open what it hangs on.
 */
export async function toReportedComment(userId: string, commentId: string): Promise<ReportedSubject | null> {
	const [commentRow] = await db.select().from(comments).where(eq(comments.id, commentId))
	const resolvedSocialTarget = commentRow ? await resolveSocialTarget(userId, toRowCommentTarget(commentRow)) : null
	if (!commentRow || !resolvedSocialTarget) {
		return null
	}
	return {
		kind: "comment",
		id: commentRow.id,
		label: `a hot take on ${resolvedSocialTarget.label}`,
		path: resolvedSocialTarget.path,
		text: toReportText(commentRow.body),
		authorUserId: commentRow.authorUserId,
	}
}
