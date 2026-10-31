// the admin console data: the users table with status and cost, the teams table, the platform totals with a
// contribution figure, and the expandable rows behind a user or a team

import type { OwnerTopic } from "@carlnotes/contracts/activity"
import type { AdminTeamRow, AdminTopicSubscriberRow, AdminTotals, AdminUserRow } from "@carlnotes/contracts/admin"
import { toAvatarKeyVersion, toAvatarVersion } from "@carlnotes/contracts/avatars"
import { toCentsFromDollars } from "@carlnotes/contracts/plans"
import type { TeamPageResponse, TeamSummary } from "@carlnotes/contracts/teams"
import { db } from "@carlnotes/db"
import { chatAttachments, chatTurns } from "@carlnotes/db/schema/chat"
import { EMBED_DIMENSIONS, findings, resources, scans } from "@carlnotes/db/schema/scans"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { attachments, subscriptions, topicEmailSends, topics } from "@carlnotes/db/schema/topics"
import { userBlocks } from "@carlnotes/db/schema/userBlocks"
import { users } from "@carlnotes/db/schema/users"
import { readLiteLLMKeySpend } from "@carlnotes/models/litellmProxy"
import { toPositiveInteger } from "@carlnotes/server/envSettings"
import { and, count, desc, eq, gte, isNotNull, max, sql } from "drizzle-orm"
import { loadOwnedTopics } from "./activityTopics"
import { isAdminRole, userBudgetCents } from "./authorization"
import { withAvatarVersion } from "./avatars"
import { readStripeTotalRevenueCents } from "./billing"
import { loadTeamSummaries, toSpendByTeamId } from "./team/helpers"
import { startOfUtcMonth } from "./topic/quotas"
import { isActiveNonOwnerTopicSubscription } from "./topic/subscriberCounts"

// the bytes one embedded Resource attributes. a float4 dimension is four bytes wide
const EMBED_BYTES = EMBED_DIMENSIONS * 4

/**
 * A user's owned topics as their own Activity page would show them for the subtable in an admin's users table
 */
export async function loadAdminUserTopics({
	userId,
	adminUserId,
}: {
	userId: string
	adminUserId: string
}): Promise<OwnerTopic[] | null> {
	// the loader keys off the user, so an admin reads exactly what that user reads, with no second query to drift
	const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId))
	if (!user) {
		return null
	}
	return loadOwnedTopics({ userId: user.id, signedInUserId: adminUserId })
}

/**
 * One row per user for the admin table: status, topic and team counts, attributed storage, and month-to-date variable cost against their budget.
 */
export async function loadAdminUsers(): Promise<AdminUserRow[]> {
	// the base user rows, the per-user topic and team counts, the attributed storage
	const monthStart = startOfUtcMonth(new Date())
	const [userRows, topicCountRows, teamCountRows, storageByUser, scanSpendRows, chatSpendRows] = await Promise.all([
		db
			.select({
				// identity and status
				id: users.id,
				email: users.email,
				username: users.username,
				avatarSource: users.avatarSource,
				avatarKey: users.avatarKey,
				role: users.role,
				plan: users.plan,
				// the override, signup and last-login times, and the key that bills topic scans
				budgetOverrideCents: users.budgetOverrideCents,
				createdAt: users.createdAt,
				lastLoginAt: users.lastLoginAt,
				litellmVirtualKey: users.litellmVirtualKey,
			})
			.from(users),
		db.select({ ownerId: topics.ownerId, count: count() }).from(topics).groupBy(topics.ownerId),
		db
			.select({ userId: teamMembers.userId, count: count() })
			.from(teamMembers)
			.where(eq(teamMembers.isActive, true))
			.groupBy(teamMembers.userId),
		loadAttributedStorage(),
		db
			.select({ ownerId: scans.ownerId, dollars: sql<string>`coalesce(sum(${scans.cost}), 0)` })
			.from(scans)
			.where(gte(scans.startedAt, monthStart))
			.groupBy(scans.ownerId),
		db
			.select({ userId: chatTurns.userId, dollars: sql<string>`coalesce(sum(${chatTurns.cost}), 0)` })
			.from(chatTurns)
			.where(gte(chatTurns.createdAt, monthStart))
			.groupBy(chatTurns.userId),
	])

	// read each user's observed spend in parallel, best-effort, keyed by user id one proxy call per user, batch
	const userSpends = await Promise.all(
		userRows.map(async (user) => {
			const spendDollars = user.litellmVirtualKey ? await readLiteLLMKeySpend(user.litellmVirtualKey) : null
			return [user.id, spendDollars] as const
		}),
	)
	const spendByUser = new Map(userSpends)
	const topicCountByUser = new Map(topicCountRows.map((topicCountRow) => [topicCountRow.ownerId, topicCountRow.count]))
	const teamCountByUser = new Map(teamCountRows.map((teamCountRow) => [teamCountRow.userId, teamCountRow.count]))

	// the app's own totals keyed by user, in cents
	const scanSpendByUser = new Map(
		scanSpendRows.map((scanSpendRow) => [scanSpendRow.ownerId, toCentsFromDollars(Number(scanSpendRow.dollars))]),
	)
	const chatSpendByUser = new Map(
		chatSpendRows.map((chatSpendRow) => [chatSpendRow.userId, toCentsFromDollars(Number(chatSpendRow.dollars))]),
	)

	// assemble each row, converting the observed dollar spend to cents and resolving the budget
	return userRows.map((user) => {
		const spendDollars = spendByUser.get(user.id) ?? null
		return {
			// identity and status
			id: user.id,
			email: user.email,
			username: user.username,
			avatarSource: user.avatarSource,
			avatarVersion: toAvatarVersion(user),
			role: user.role,
			plan: user.plan,
			createdAt: user.createdAt.toISOString(),
			lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
			topicCount: topicCountByUser.get(user.id) ?? 0,
			teamCount: teamCountByUser.get(user.id) ?? 0,
			// the attributed storage, observed monthly cost, the app's own split totals, and budget
			attributedBytes: storageByUser.get(user.id) ?? 0,
			monthVariableCostCents: spendDollars === null ? null : toCentsFromDollars(spendDollars),
			scanSpendCents: scanSpendByUser.get(user.id) ?? 0,
			chatSpendCents: chatSpendByUser.get(user.id) ?? 0,
			budgetOverrideCents: user.budgetOverrideCents,
			budgetCents: userBudgetCents({
				isAdmin: isAdminRole(user.role),
				plan: user.plan,
				budgetOverrideCents: user.budgetOverrideCents,
			}),
		}
	})
}

/**
 * One team's active members in the team page's members table shape, for the admin console's expandable row.
 */
export async function loadAdminTeamMembers(teamId: string): Promise<TeamPageResponse["members"] | null> {
	const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId))
	if (!team) {
		return null
	}

	// the same columns the team page's members table reads, so the same table renders them
	const teamMemberRows = await db
		.select({
			userId: users.id,
			username: users.username,
			avatarSource: users.avatarSource,
			avatarKey: users.avatarKey,
			role: teamMembers.role,
			isMemberVisible: teamMembers.isMemberVisible,
			isActive: teamMembers.isActive,
		})
		.from(teamMembers)
		.innerJoin(users, eq(users.id, teamMembers.userId))
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true)))
	return teamMemberRows.map(withAvatarVersion)
}

/** Lists a topic's subscribers by the subscriber count's rule, newest first. Null for a missing topic. */
export async function loadAdminTopicSubscribers(topicId: string): Promise<AdminTopicSubscriberRow[] | null> {
	// return null for a missing topic
	const [topic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		return null
	}

	// how many emails the topic sent each recipient, and when it sent the latest
	const sentEmails = db
		.select({
			recipientUserId: topicEmailSends.recipientUserId,
			emailCount: count().as("email_count"),
			lastEmailedAt: max(topicEmailSends.sentAt).as("last_emailed_at"),
		})
		.from(topicEmailSends)
		.where(eq(topicEmailSends.topicId, topicId))
		.groupBy(topicEmailSends.recipientUserId)
		.as("sent_emails")

	// the active non-owner subscriptions with each subscriber's account and the topic's emails to them.
	// the topics join supplies the owner id that isActiveNonOwnerTopicSubscription reads
	const topicSubscriberRows = await db
		.select({
			userId: users.id,
			username: users.username,
			avatarSource: users.avatarSource,
			avatarKey: users.avatarKey,
			email: users.email,
			plan: users.plan,
			signedUpAt: users.createdAt,
			lastLoginAt: users.lastLoginAt,
			subscribedAt: subscriptions.createdAt,
			isEmailEnabled: subscriptions.isEmailEnabled,
			emailCount: sentEmails.emailCount,
			lastEmailedAt: sentEmails.lastEmailedAt,
		})
		.from(subscriptions)
		.innerJoin(topics, eq(topics.id, subscriptions.topicId))
		.innerJoin(users, eq(users.id, subscriptions.subscriberUserId))
		.leftJoin(sentEmails, eq(sentEmails.recipientUserId, users.id))
		.where(and(eq(subscriptions.topicId, topicId), isActiveNonOwnerTopicSubscription))
		.orderBy(desc(subscriptions.createdAt))

	// each subscriber with their avatar's version in place of its storage key, 0 for one the topic never emailed, and
	// their dates as iso strings
	return topicSubscriberRows.map(
		({
			avatarSource,
			avatarKey,
			emailCount,
			signedUpAt,
			lastLoginAt,
			subscribedAt,
			lastEmailedAt,
			...topicSubscriberRow
		}) => ({
			...topicSubscriberRow,
			avatarVersion: toAvatarVersion({ avatarSource, avatarKey }),
			emailCount: emailCount ?? 0,
			signedUpAt: signedUpAt.toISOString(),
			lastLoginAt: lastLoginAt?.toISOString() ?? null,
			subscribedAt: subscribedAt.toISOString(),
			lastEmailedAt: lastEmailedAt?.toISOString() ?? null,
		}),
	)
}

/**
 * The teams a user actively belongs to, in the teams table shape, for the admin console's expandable row.
 */
export async function loadAdminUserTeams(userId: string): Promise<TeamSummary[] | null> {
	const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId))
	return user ? loadTeamSummaries(userId) : null
}

/**
 * One row per team for the admin table: the team's status, its member and topic counts, and month-to-date spend across its topics.
 * Teams are never billed: each cost here was already billed to its topic's owner or chatting member.
 */
export async function loadAdminTeams(): Promise<AdminTeamRow[]> {
	// the team rows, the active member count, and each team's topic count, all in parallel
	const [teamRows, memberCountRows, topicCountRows] = await Promise.all([
		db
			.select({
				teamId: teams.id,
				name: teams.name,
				isPublic: teams.isPublic,
				createdAt: teams.createdAt,
				avatarKey: teams.avatarKey,
			})
			.from(teams),
		// each team's active member count
		db
			.select({ teamId: teamMembers.teamId, count: count() })
			.from(teamMembers)
			.where(eq(teamMembers.isActive, true))
			.groupBy(teamMembers.teamId),
		db
			.select({ teamId: topics.teamId, count: count() })
			.from(topics)
			.where(isNotNull(topics.teamId))
			.groupBy(topics.teamId),
	])

	// spend is summed over the team's topics by the same loader the teams page reads
	const spendByTeam = await toSpendByTeamId(teamRows.map((team) => team.teamId))

	// member and topic counts are mapped to team id
	const memberCountByTeam = new Map(
		memberCountRows.map((memberCountRow) => [memberCountRow.teamId, memberCountRow.count]),
	)
	const topicCountByTeam = new Map(topicCountRows.map((topicCountRow) => [topicCountRow.teamId, topicCountRow.count]))

	// return the rows of the teams table
	return teamRows.map((team) => {
		return {
			teamId: team.teamId,
			name: team.name,
			isPublic: team.isPublic,
			createdAt: team.createdAt.toISOString(),
			avatarVersion: toAvatarKeyVersion(team.avatarKey),
			memberCount: memberCountByTeam.get(team.teamId) ?? 0,
			topicCount: topicCountByTeam.get(team.teamId) ?? 0,
			scanSpendCents: spendByTeam.get(team.teamId)?.scanCents ?? 0,
			chatSpendCents: spendByTeam.get(team.teamId)?.chatCents ?? 0,
		}
	})
}

/**
 * The totals summary from the already-loaded user rows, plus the web's Stripe net revenue and the derived contribution.
 */
export async function loadAdminTotals(userRows: AdminUserRow[]): Promise<AdminTotals> {
	// sum the per-user attributed storage and observed variable cost across the platform
	const attributedBytes = userRows.reduce((sum, userRow) => sum + userRow.attributedBytes, 0)
	const monthVariableCostCents = userRows.reduce((sum, userRow) => sum + (userRow.monthVariableCostCents ?? 0), 0)

	// pull Stripe's netted revenue for the month and derive the contribution, minus an optional flat fixed-cost constant
	const netRevenueCents = await readStripeTotalRevenueCents(Math.floor(startOfUtcMonth(new Date()).getTime() / 1000))
	const fixedMonthlyCostCents = toPositiveInteger(Bun.env.FIXED_MONTHLY_COST_CENTS, 0)

	// the blocks between users, as a count alone
	const [blockCountRow] = await db.select({ blockCount: count() }).from(userBlocks)
	return {
		attributedBytes,
		monthVariableCostCents,
		netRevenueCents,
		contributionCents: computeContributionCents(netRevenueCents, monthVariableCostCents, fixedMonthlyCostCents),
		blockCount: blockCountRow?.blockCount ?? 0,
	}
}

/**
 * Contribution in cents: net revenue minus tracked variable cost minus an optional fixed cost. Null if revenue is unavailable.
 */
export function computeContributionCents(
	netRevenueCents: number | null,
	trackedVariableCostCents: number,
	fixedCostCents: number,
): number | null {
	// with no revenue figure, there is nothing to net against, so contribution is unavailable
	if (netRevenueCents === null) {
		return null
	}
	return netRevenueCents - trackedVariableCostCents - fixedCostCents
}

// attributed storage in bytes per user: distinct resource content + embedding bytes + attachment bytes across their topics
async function loadAttributedStorage(): Promise<Map<string, number>> {
	// distinct (owner, resource) pairs so the same Resource in two of a user's topics counts once
	const userResources = db
		.selectDistinct({ userId: topics.ownerId, resourceId: findings.resourceId })
		.from(topics)
		.innerJoin(findings, eq(findings.topicId, topics.id))
		.as("user_resources")

	// content bytes summed per user, and how many of those distinct resources have an embedding
	const contentRows = await db
		.select({
			userId: userResources.userId,
			contentBytes: sql<number>`coalesce(sum(coalesce(${resources.contentBytes}, octet_length(coalesce(${resources.content}, '')))), 0)`,
			embeddedCount: sql<number>`count(*) filter (where ${resources.embedding} is not null)`,
		})
		.from(userResources)
		.innerJoin(resources, eq(resources.id, userResources.resourceId))
		.groupBy(userResources.userId)

	// attachment bytes across all topics per user
	const attachmentRows = await db
		.select({ userId: topics.ownerId, bytes: sql<number>`coalesce(sum(${attachments.byteSize}), 0)` })
		.from(topics)
		.innerJoin(attachments, eq(attachments.topicId, topics.id))
		.groupBy(topics.ownerId)

	// combine content + embedding + attachment bytes per user. postgres returns the aggregates as strings, so coerce
	const bytesByUser = new Map<string, number>()
	for (const contentRow of contentRows) {
		bytesByUser.set(contentRow.userId, Number(contentRow.contentBytes) + Number(contentRow.embeddedCount) * EMBED_BYTES)
	}

	// add attachment bytes onto each user's running total
	for (const attachmentRow of attachmentRows) {
		bytesByUser.set(attachmentRow.userId, (bytesByUser.get(attachmentRow.userId) ?? 0) + Number(attachmentRow.bytes))
	}

	// kept chat attachments attribute to the user who kept them, not to the topic's owner
	const chatAttachmentRows = await db
		.select({ userId: chatAttachments.userId, bytes: sql<number>`coalesce(sum(${chatAttachments.byteSize}), 0)` })
		.from(chatAttachments)
		.groupBy(chatAttachments.userId)

	// add kept bytes onto each user's running total
	for (const chatAttachmentRow of chatAttachmentRows) {
		bytesByUser.set(
			chatAttachmentRow.userId,
			(bytesByUser.get(chatAttachmentRow.userId) ?? 0) + Number(chatAttachmentRow.bytes),
		)
	}
	return bytesByUser
}
