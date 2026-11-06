// the read filters that decide what one user sees: rows by a person they blocked, subjects they reported, the topics
// they hold a role on, and the topic chat rooms a team still has
import { personalSourceKinds } from "@carlnotes/contracts/enums"
import type { ReportSubjectKind } from "@carlnotes/contracts/reports"
import {
	and,
	eq,
	exists,
	inArray,
	isNull,
	ne,
	notExists,
	notInArray,
	or,
	type SQL,
	type SQLWrapper,
	sql,
} from "drizzle-orm"
import { db } from "./index"
import { reports } from "./schema/reports"
import { scans } from "./schema/scans"
import { teamMembers } from "./schema/teams"
import { teamTopics } from "./schema/teamTopics"
import { sources, subscriptions, topics } from "./schema/topics"
import { userBlocks } from "./schema/userBlocks"
import { users } from "./schema/users"

// the reports that hide their subject from the reporter: the open ones and the kept ones
export const OPEN_OR_KEPT_REPORT_FILTER = or(isNull(reports.resolvedAt), eq(reports.resolution, "kept")) as SQL

// the ready Sources every user and visitor of a topic may see. a personal Source belongs to its sender
export const isReadySharedSource = and(eq(sources.status, "ready"), notInArray(sources.kind, [...personalSourceKinds]))

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

/**
 * Returns the filter that keeps an invite topic's scans from before the user's subscription activated out of a read
 * that joins topics and scans. An admin and a role on the topic read every scan, and a null user reads none of them.
 */
export function toActivatedScanFilter(userId: string | null): SQL {
	const isNotInviteTopic = ne(topics.visibility, "invite")
	if (!userId) {
		return isNotInviteTopic
	}

	// the earliest activation of the user's active subscription wins
	const activatedAtQuery = db
		.select({ activatedAt: sql`min(${subscriptions.createdAt})` })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.topicId, topics.id),
				eq(subscriptions.subscriberUserId, userId),
				eq(subscriptions.isActive, true),
			),
		)
	const isAdmin = exists(
		db
			.select({ id: users.id })
			.from(users)
			.where(and(eq(users.id, userId), eq(users.role, "admin"))),
	)
	return or(
		isNotInviteTopic,
		isAdmin,
		toTopicRoleFilter(userId),
		sql`${scans.startedAt} > (${activatedAtQuery})`,
	) as SQL
}

/**
 * The filter for whether a team owns a topic or holds a share of it. The team and the topic are ids, or columns for a
 * read of many chat rooms at once.
 */
export function toTeamHoldsTopicFilter(teamId: string | SQLWrapper, topicId: string | SQLWrapper): SQL | undefined {
	// the team owns the topic
	const ownedTopicQuery = db
		.select({ topicId: topics.id })
		.from(topics)
		.where(and(eq(topics.id, topicId), eq(topics.teamId, teamId)))

	// the topic was shared with the team
	const sharedTopicQuery = db
		.select({ topicId: teamTopics.topicId })
		.from(teamTopics)
		.where(and(eq(teamTopics.topicId, topicId), eq(teamTopics.teamId, teamId)))
	return or(exists(ownedTopicQuery), exists(sharedTopicQuery))
}
