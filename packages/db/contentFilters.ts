// the read filters that decide what one user sees: rows by a person they blocked, subjects they reported, and the
// topics they hold a role on
import type { ReportSubjectKind } from "@carlnotes/contracts/reports"
import { and, eq, inArray, isNull, notExists, or, type SQL, type SQLWrapper, sql } from "drizzle-orm"
import { db } from "./index"
import { reports } from "./schema/reports"
import { teamMembers, teamTopics } from "./schema/teams"
import { topics } from "./schema/topics"
import { userBlocks } from "./schema/userBlocks"

// the reports that hide their subject from the reporter: the open ones and the kept ones
export const OPEN_OR_KEPT_REPORT_FILTER = or(isNull(reports.resolvedAt), eq(reports.resolution, "kept")) as SQL

/**
 * Returns the filter that keeps rows by a person the user has blocked out of a read. A row with no author passes.
 * The user is an id, or a column for a read of many users at once.
 */
export function toUnblockedAuthorFilter(userId: string | SQLWrapper, authorUserIdColumn: SQLWrapper): SQL {
	// the row passes with no author, or with an author the user has not blocked
	return or(
		isNull(authorUserIdColumn),
		notExists(
			db
				.select({ blockedUserId: userBlocks.blockedUserId })
				.from(userBlocks)
				.where(and(eq(userBlocks.blockerUserId, userId), eq(userBlocks.blockedUserId, authorUserIdColumn))),
		),
	) as SQL
}

/**
 * Returns the filter that keeps a user's reported subjects out of a read, by the column that holds the subject id.
 * The user is an id, or a column for a read of many users at once.
 */
export function toUnreportedFilter(
	userId: string | SQLWrapper,
	subjectKind: ReportSubjectKind,
	subjectIdColumn: SQLWrapper,
): SQL {
	// a message id is a bigint, so the stored text id is compared against the column as text
	return notExists(
		db
			.select({ id: reports.id })
			.from(reports)
			.where(
				and(
					eq(reports.reporterUserId, userId),
					eq(reports.subjectKind, subjectKind),
					eq(reports.subjectId, sql`${subjectIdColumn}::text`),
					OPEN_OR_KEPT_REPORT_FILTER,
				),
			),
	)
}

/**
 * Returns whether the user has a role on a topic in SQL: they own it, a team of theirs owns it, or a team of theirs
 * holds it through a share. The user is an id, or a column for a read of many users at once.
 */
export function toTopicRoleFilter(userId: string | SQLWrapper): SQL | undefined {
	// the user's active teams, and the topics shared with those teams
	const memberTeamIds = db
		.select({ teamId: teamMembers.teamId })
		.from(teamMembers)
		.where(and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)))
	const sharedTopicIds = db
		.select({ topicId: teamTopics.topicId })
		.from(teamTopics)
		.where(inArray(teamTopics.teamId, memberTeamIds))

	// a topic the user owns, or one their teams own or hold
	return or(eq(topics.ownerId, userId), inArray(topics.teamId, memberTeamIds), inArray(topics.id, sharedTopicIds))
}
