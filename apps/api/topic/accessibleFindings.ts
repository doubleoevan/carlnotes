// the findings a user may read on a topic, with the owning team's bookmarks attached
import { toAvatarVersion } from "@carlnotes/contracts/avatars"
import type { ReactionSummary, SocialTarget } from "@carlnotes/contracts/social"
import { db } from "@carlnotes/db"
import { bookmarks, findings } from "@carlnotes/db/schema/scans"
import { teamMembers } from "@carlnotes/db/schema/teams"
import { teamTopics } from "@carlnotes/db/schema/teamTopics"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { topicSubscriptionStartDate } from "@carlnotes/db/topicPermissions"
import { and, eq, inArray, or, sql } from "drizzle-orm"
import { isAllowed, loadUserAccess } from "../authorization"
import { attachTopicFindingFaviconPaths } from "../favicons"
import { attachReactionSummaries } from "../social/findingReactions"
import { type FindingPageWindow, loadTopicFindings } from "./findings"

/**
 * Loads the topic, or null if it is missing or the user may not see it.
 */
export async function loadViewableTopic(
	userId: string | null,
	topicId: string,
): Promise<typeof topics.$inferSelect | null> {
	// read the topic with the user's access read started beside it. the view check shares that read through the
	// request memo
	const [[topic]] = await Promise.all([
		db.select().from(topics).where(eq(topics.id, topicId)),
		userId ? loadUserAccess(userId) : null,
	])
	return topic && (await isAllowed(userId, "topic:view", topic)) ? topic : null
}

// attach the bookmarks from the team that owns the topic to its topic findings
async function attachTeamBookmarks(
	topicFindings: Awaited<ReturnType<typeof loadTopicFindings>>,
	topicId: string,
	owningTeamId: string | null,
): Promise<void> {
	// no findings have no bookmarks to attach
	if (topicFindings.length === 0) {
		return
	}

	// build the subquery to check if a user belongs to the team that owns the topic
	const topicTeamIds = db.select({ teamId: teamTopics.teamId }).from(teamTopics).where(eq(teamTopics.topicId, topicId))
	const isTopicOwningMember = or(
		inArray(teamMembers.teamId, topicTeamIds),
		owningTeamId ? eq(teamMembers.teamId, owningTeamId) : sql`false`,
	)

	// the ids of the findings being returned
	const findingIds = topicFindings.map((topicFinding) => topicFinding.findingId)

	// select the bookmarks from the team that owns the topic
	const teamBookmarkRows = await db
		.selectDistinct({
			findingId: bookmarks.findingId,
			userId: users.id,
			username: users.username,
			avatarSource: users.avatarSource,
			avatarKey: users.avatarKey,
		})
		.from(bookmarks)
		.innerJoin(findings, and(eq(bookmarks.findingId, findings.id), eq(findings.topicId, topicId)))
		.innerJoin(
			teamMembers,
			and(eq(teamMembers.userId, bookmarks.userId), eq(teamMembers.isActive, true), isTopicOwningMember),
		)
		.innerJoin(users, eq(users.id, bookmarks.userId))
		// on these findings alone, so a page of the findings reads only that page's bookmarks
		.where(inArray(bookmarks.findingId, findingIds))

	// attach the team bookmarks to the topic findings
	const bookmarksByFindingId = Map.groupBy(teamBookmarkRows, (row) => row.findingId)
	for (const topicFinding of topicFindings) {
		topicFinding.teamBookmarks = (bookmarksByFindingId.get(topicFinding.findingId) ?? []).map((bookmark) => ({
			userId: bookmark.userId,
			username: bookmark.username,
			avatarSource: bookmark.avatarSource,
			avatarVersion: toAvatarVersion(bookmark),
		}))
	}
}

// the topic, the user whose access gates its findings, an optional page window of the findings,
// and whether to leave out the findings rated thumbs down
type LoadTopicAccessAndFindingsOptions = {
	topic: typeof topics.$inferSelect
	userId: string | null
	pageWindow?: FindingPageWindow
	isRatedDownExcluded?: boolean
	// the page's own social target, whose reaction summary loads with the findings' in the same reads
	pageSocialTarget?: SocialTarget
	// for a caller that keeps only some of the Findings and reads the reactions of those
	isReactionReadSkipped?: boolean
}

// the user's topic access and the findings it gates, up to the read limit or within one page window
export async function loadTopicAccessAndFindings({
	topic,
	userId,
	pageWindow,
	isRatedDownExcluded,
	pageSocialTarget,
	isReactionReadSkipped = false,
}: LoadTopicAccessAndFindingsOptions): Promise<{
	isAdmin: boolean
	topicFindings: Awaited<ReturnType<typeof loadTopicFindings>>
	reactions: ReactionSummary | undefined
}> {
	// only the owner and admins can see the spend
	const { isAdmin } = userId ? await loadUserAccess(userId) : { isAdmin: false }

	// the topic findings with this user's consumed state, gated by when an invite was accepted
	const topicFindings = await loadTopicFindings({
		topicId: topic.id,
		userId,
		subscriberActivatedAt: await topicSubscriptionStartDate(topic, userId, isAdmin),
		pageWindow,
		isRatedDownExcluded,
	})

	// each Finding's reactions and the page's own, as this user reads them, unless the caller reads its own Findings',
	// the owning team's bookmarks, and the favicons. each fills its own fields of the findings, so they load together
	const [reactions] = await Promise.all([
		isReactionReadSkipped ? undefined : attachReactionSummaries({ topicFindings, userId, pageSocialTarget }),
		attachTeamBookmarks(topicFindings, topic.id, topic.teamId),
		attachTopicFindingFaviconPaths(topicFindings),
	])
	return { isAdmin, topicFindings, reactions }
}
