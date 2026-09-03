// the Activity page's payload, the user's own or, for an admin, any user's
import type { ActivityResponse, ActivityScan, ChatMention, OwnerTopic, SubscriptionRow } from "@shared/contracts"
import { and, count, desc, eq, gt, gte, inArray, isNotNull, isNull, ne, notInArray, or, sql } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../db"
import { invites, scans, subscriptions, teamMembers, teams, topicEmailSends, topics, users } from "../db/schema"
import { effectiveBudgetCents, isAdminRole, isAllowed, monthlySpendDollars } from "./authorization"
import { loadTopicChatMentions } from "./chat/mentions"
import type { AppEnv } from "./currentUser"
import { toInvitee } from "./invite/userInvites"
import { startOfUtcMonth } from "./topic/quotas"

// the topic rows that toActivityTopics reads
type TopicRow = {
	id: string
	ownerId: string
	name: string
	visibility: OwnerTopic["visibility"]
	frequency: OwnerTopic["frequency"]
	// the times the activity list sorts and dates its rows by
	createdAt: Date
	updatedAt: Date
}
// the month-scan rows that hang off each topic in the sub-table
type ScanRow = {
	id: string
	topicId: string
	// the outcome and, for a failed scan, the recorded reason
	status: ActivityScan["status"]
	error: string | null
	startedAt: Date
	finishedAt: Date | null
	// set if the user stopped the scan, which the recap line reads
	stoppedAt: Date | null
	// what the scan found, kept, and cost
	foundCount: number
	keptCount: number
	costDollars: string
}

/**
 * Assemble the Activity payload for the user
 */
export async function loadActivity(user: { id: string; email: string }, isOwnView = true): Promise<ActivityResponse> {
	// select the user's identity, budget inputs, litellm key, and owned topics
	const [userRow] = await db
		.select({
			litellmVirtualKey: users.litellmVirtualKey,
			role: users.role,
			plan: users.plan,
			budgetOverrideCents: users.budgetOverrideCents,
			username: users.username,
			avatarSource: users.avatarSource,
		})
		.from(users)
		.where(eq(users.id, user.id))
	// the ids of the topics that the user owns
	const ownedTopicIds = (await db.select({ id: topics.id }).from(topics).where(eq(topics.ownerId, user.id))).map(
		(row) => row.id,
	)

	// this month's spend divided into what produced it.
	const monthlySpend = await monthlySpendDollars(user.id)

	// the user's subscriptions on topics they do not own, both active and inactive alike
	const subscriptionRows = await db
		.select({
			topicId: topics.id,
			name: topics.name,
			owner: { userId: users.id, username: users.username, avatarSource: users.avatarSource },
			team: {
				teamId: teams.id,
				name: teams.name,
				avatarKey: teams.avatarKey,
				isPublic: teams.isPublic,
				memberUserId: teamMembers.userId,
			},
			visibility: topics.visibility,
			subscribedAt: subscriptions.createdAt,
			isActive: subscriptions.isActive,
			isEmailEnabled: subscriptions.isEmailEnabled,
			// a real subscription row is not a pending invitation, so it includes no invite id
			inviteId: sql<string | null>`null`,
		})
		.from(subscriptions)
		.innerJoin(topics, eq(subscriptions.topicId, topics.id))
		.innerJoin(users, eq(topics.ownerId, users.id))
		.leftJoin(teams, eq(teams.id, topics.teamId))
		// whether this user belongs to the owning team, which decides if a private one may be named
		.leftJoin(
			teamMembers,
			and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, user.id), eq(teamMembers.isActive, true)),
		)
		.where(and(ne(topics.ownerId, user.id), eq(subscriptions.subscriberUserId, user.id)))

	// the invitations the user sent on their own topics, and whether each invitee subscribed
	const inviteRows = await db
		.select({
			inviteId: invites.id,
			topicId: invites.topicId,
			name: topics.name,
			inviteeEmail: invites.email,
			invitedAt: invites.invitedAt,
			subscribedAt: subscriptions.createdAt,
			// the invitee's account fields, null until the invitation names or resolves to an account
			inviteeUserId: users.id,
			inviteeUsername: users.username,
			inviteeAvatarSource: users.avatarSource,
		})
		.from(invites)
		.innerJoin(topics, eq(invites.topicId, topics.id))
		.leftJoin(
			users,
			or(eq(users.id, invites.invitedUserId), and(isNull(invites.invitedUserId), eq(users.email, invites.email))),
		)
		.leftJoin(
			subscriptions,
			and(
				eq(subscriptions.topicId, invites.topicId),
				eq(subscriptions.subscriberUserId, users.id),
				eq(subscriptions.isActive, true),
			),
		)
		.where(
			// user invites, matched by email or by account, and invite links left out. declined rows are stored but hidden here
			and(
				eq(topics.ownerId, user.id),
				or(isNotNull(invites.email), isNotNull(invites.invitedUserId)),
				isNull(invites.declinedAt),
			),
		)

	return {
		// whose activity this is, for the page's profile link
		user: { userId: user.id, username: userRow?.username ?? "", avatarSource: userRow?.avatarSource ?? null },
		scanSpendCents: Math.round(monthlySpend.scanDollars * 100),
		chatSpendCents: Math.round(monthlySpend.chatDollars * 100),
		budgetCents: effectiveBudgetCents({
			isAdmin: isAdminRole(userRow?.role),
			plan: userRow?.plan ?? "free",
			budgetOverrideCents: userRow?.budgetOverrideCents ?? null,
		}),
		topics: await loadTopics(ownedTopicIds, isOwnView ? user.id : null),
		subscriptions: toSubscriptionRows([
			// the joined team columns convert to the team's identity before the rows merge
			...subscriptionRows.map((subscriptionRow) => ({
				...subscriptionRow,
				team: toTeamIdentity(subscriptionRow.team),
			})),
			...(await loadInvitedTopicSubscriptions(user)),
		]),
		invites: inviteRows.map((inviteRow) => ({
			inviteId: inviteRow.inviteId,
			topicId: inviteRow.topicId ?? "",
			name: inviteRow.name,
			// the email address if the sender typed one, null on a username invitation
			inviteeEmail: inviteRow.inviteeEmail,
			invitee: toInvitee(inviteRow),
			invitedAt: inviteRow.invitedAt.toISOString(),
			subscribedAt: inviteRow.subscribedAt?.toISOString() ?? null,
		})),
	}
}

// the topic invitations waiting for this user's answer, shaped as the subscription rows they will become,
async function loadInvitedTopicSubscriptions(user: {
	id: string
	email: string
}): Promise<(Omit<SubscriptionRow, "subscribedAt"> & { subscribedAt: Date })[]> {
	const subscribedTopicIdQuery = db
		.select({ topicId: subscriptions.topicId })
		.from(subscriptions)
		.where(eq(subscriptions.subscriberUserId, user.id))
	// the pending invitations, each with the topic it opens and the owner who sent it
	const invitedRows = await db
		.select({
			inviteId: invites.id,
			topicId: topics.id,
			name: topics.name,
			owner: { userId: users.id, username: users.username, avatarSource: users.avatarSource },
			team: {
				teamId: teams.id,
				name: teams.name,
				avatarKey: teams.avatarKey,
				isPublic: teams.isPublic,
				memberUserId: teamMembers.userId,
			},
			visibility: topics.visibility,
			invitedAt: invites.invitedAt,
		})
		.from(invites)
		.innerJoin(topics, eq(topics.id, invites.topicId))
		.innerJoin(users, eq(users.id, topics.ownerId))
		.leftJoin(teams, eq(teams.id, topics.teamId))
		// whether this user belongs to the owning team, which decides if a private one may be named
		.leftJoin(
			teamMembers,
			and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, user.id), eq(teamMembers.isActive, true)),
		)
		.where(
			// pending means unanswered: no spent use, no decline, no passed expiry
			and(
				or(eq(invites.invitedUserId, user.id), eq(invites.email, user.email)),
				eq(invites.usedCount, 0),
				isNull(invites.declinedAt),
				or(isNull(invites.expiresAt), gt(invites.expiresAt, new Date())),
				notInArray(topics.id, subscribedTopicIdQuery),
			),
		)
		.orderBy(desc(invites.invitedAt))

	// a person can hold an email invitation and a username invitation to the same topic. the newest invite is shown.
	const newestByTopic = new Map<string, (typeof invitedRows)[number]>()
	for (const row of invitedRows.toReversed()) {
		newestByTopic.set(row.topicId, row)
	}

	// an invitation is a subscription that is not active yet. it has no email preference until it is
	return [...newestByTopic.values()].toReversed().map((scanRow) => ({
		topicId: scanRow.topicId,
		name: scanRow.name,
		owner: scanRow.owner,
		team: toTeamIdentity(scanRow.team),
		visibility: scanRow.visibility,
		subscribedAt: scanRow.invitedAt,
		isActive: false,
		isEmailEnabled: false,
		inviteId: scanRow.inviteId,
	}))
}

// the owning team's joined columns as the team's identity, null if the topic is not on a team
function toTeamIdentity(team: {
	// null on a topic no team owns
	teamId: string | null
	name: string | null
	avatarKey: string | null
	isPublic: boolean | null
	// set only where the user is an active member, which is what lets a private team be named
	memberUserId: string | null
}): { teamId: string; name: string; hasAvatar: boolean } | null {
	// a private team is named to its own members alone, so an outside subscriber or invitee sees the owner instead
	if (team.teamId === null || team.name === null || (!team.isPublic && team.memberUserId === null)) {
		return null
	}
	return { teamId: team.teamId, name: team.name, hasAvatar: team.avatarKey !== null }
}

/**
 * The subscription rows with subscribedAt as the iso string the payload sends.
 */
export function toSubscriptionRows(
	subscriptionRows: (Omit<SubscriptionRow, "subscribedAt"> & { subscribedAt: Date })[],
): SubscriptionRow[] {
	return subscriptionRows.map((subscriptionRow) => ({
		...subscriptionRow,
		subscribedAt: subscriptionRow.subscribedAt.toISOString(),
	}))
}

/**
 * The activity rows for a given set of topics, whoever owns them. The admin console reads a team's topics through this,
 * so a team's subtable shows its topic activity.
 */
export async function loadTopics(topicIds: string[], mentionUserId: string | null = null): Promise<OwnerTopic[]> {
	if (topicIds.length === 0) {
		return []
	}

	// the topic rows themselves and their scan history this month
	const monthStart = startOfUtcMonth(new Date())
	const topicRows = await db
		.select({
			id: topics.id,
			ownerId: topics.ownerId,
			name: topics.name,
			visibility: topics.visibility,
			frequency: topics.frequency,
			createdAt: topics.createdAt,
			updatedAt: topics.updatedAt,
		})
		.from(topics)
		.where(inArray(topics.id, topicIds))
	const monthScanRows = await db
		.select({
			id: scans.id,
			topicId: scans.topicId,
			// the scan outcome and its recorded failure reason for the recap popover
			status: scans.status,
			error: scans.error,
			startedAt: scans.startedAt,
			finishedAt: scans.finishedAt,
			stoppedAt: scans.stoppedAt,
			// what the scan found, kept, and cost
			foundCount: scans.foundCount,
			keptCount: scans.keptCount,
			costDollars: scans.cost,
		})
		.from(scans)
		.where(and(inArray(scans.topicId, topicIds), gte(scans.startedAt, monthStart)))
		.orderBy(desc(scans.startedAt))
	const monthScans = monthScanRows.filter(
		(scanRow): scanRow is typeof scanRow & { topicId: string } => scanRow.topicId !== null,
	)

	// the counts each topic column reads, each query checking the topic's own owner
	const subscriberRows = await db
		.select({ topicId: subscriptions.topicId, count: count() })
		.from(subscriptions)
		.innerJoin(topics, eq(subscriptions.topicId, topics.id))
		.where(
			// only other subscribers, so an owner's own row never inflates their topic's count
			and(
				inArray(subscriptions.topicId, topicIds),
				eq(subscriptions.isActive, true),
				sql`${subscriptions.subscriberUserId} is distinct from ${topics.ownerId}`,
			),
		)
		.groupBy(subscriptions.topicId)
	const emailSendRows = await db
		.select({ topicId: topicEmailSends.topicId, count: count() })
		.from(topicEmailSends)
		.innerJoin(topics, eq(topicEmailSends.topicId, topics.id))
		.where(
			and(
				inArray(topicEmailSends.topicId, topicIds),
				eq(topicEmailSends.recipientUserId, topics.ownerId),
				gte(topicEmailSends.sentAt, monthStart),
			),
		)
		.groupBy(topicEmailSends.topicId)
	const ownerEmailRows = await db
		.select({ topicId: subscriptions.topicId, isEmailEnabled: subscriptions.isEmailEnabled })
		.from(subscriptions)
		.innerJoin(topics, eq(topics.id, subscriptions.topicId))
		.where(and(inArray(subscriptions.topicId, topicIds), eq(subscriptions.subscriberUserId, topics.ownerId)))
	return toActivityTopics(
		topicRows,
		monthScans,
		new Map(subscriberRows.map((subscriberRow) => [subscriberRow.topicId, subscriberRow.count])),
		new Map(ownerEmailRows.map((ownerEmailRow) => [ownerEmailRow.topicId, ownerEmailRow.isEmailEnabled])),
		new Map(emailSendRows.map((emailSendRow) => [emailSendRow.topicId, emailSendRow.count])),
		await loadTopicChatMentions(mentionUserId, topicIds),
	)
}

export function toActivityTopics(
	topicRows: TopicRow[],
	scanRows: ScanRow[],
	subscriberCountByTopic: Map<string, number>,
	emailEnabledByTopic: Map<string, boolean> = new Map(),
	emailCountByTopic: Map<string, number> = new Map(),
	mentionByTopic: Map<string, ChatMention[]> = new Map(),
): OwnerTopic[] {
	// group each topic's scans once, then build every row
	const scansByTopic = Map.groupBy(scanRows, (scan) => scan.topicId)
	return topicRows.map((topic) => {
		const topicScans = scansByTopic.get(topic.id) ?? []
		return {
			id: topic.id,
			ownerUserId: topic.ownerId,
			name: topic.name,
			visibility: topic.visibility,
			frequency: topic.frequency,
			// the month figures and dates the row's columns render
			monthScanCount: topicScans.length,
			// a topic nobody subscribes to has no row in the count query at all
			subscriberCount: subscriberCountByTopic.get(topic.id) ?? 0,
			createdAt: topic.createdAt.toISOString(),
			updatedAt: topic.updatedAt.toISOString(),
			monthCostCents: topicScans.reduce((sum, scan) => sum + toCents(scan.costDollars), 0),
			// the number of emails sent to the topic's owner this month
			monthEmailCount: emailCountByTopic.get(topic.id) ?? 0,
			// the owner holds a subscription to their own topic, and a missing row reads as on, matching the column default
			isEmailEnabled: emailEnabledByTopic.get(topic.id) ?? true,
			chatMentions: mentionByTopic.get(topic.id) ?? [],
			scans: topicScans.map((scan) => ({
				id: scan.id,
				status: scan.status,
				error: scan.error,
				startedAt: scan.startedAt.toISOString(),
				finishedAt: scan.finishedAt?.toISOString() ?? null,
				stoppedAt: scan.stoppedAt?.toISOString() ?? null,
				foundCount: scan.foundCount,
				keptCount: scan.keptCount,
				costCents: toCents(scan.costDollars),
			})),
		}
	})
}

/**
 * Cents from a dollars string, how scans.cost is stored. A null or malformed value reads as zero.
 */
export function toCents(dollars: string | null): number {
	const amount = Number(dollars)
	return Number.isFinite(amount) ? Math.round(amount * 100) : 0
}

// the activity page route. an admin may name another user to read, and everyone else reads themselves
export const activityRoute = new Hono<AppEnv>().get("/activity", async (context) => {
	// reject a signed-out visitor
	const user = context.get("user")
	if (!user) {
		return context.json({ error: "unauthorized" }, 401)
	}

	// without the userId param, the user loads their own activity
	const requestedUserId = context.req.query("userId")
	if (!requestedUserId || requestedUserId === user.id) {
		return context.json(await loadActivity({ id: user.id, email: user.email }))
	}

	// viewing another user's activity requires the admin:console permission
	if (!(await isAllowed(user.id, "admin:console"))) {
		return context.json({ error: "forbidden" }, 403)
	}

	// show the target user's activity, or nothing if no such user exists
	const [targetUser] = await db
		.select({ id: users.id, email: users.email })
		.from(users)
		.where(eq(users.id, requestedUserId))
	return targetUser ? context.json(await loadActivity(targetUser, false)) : context.json({ error: "not found" }, 404)
})
