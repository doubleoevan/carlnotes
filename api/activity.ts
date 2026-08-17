// the Activity page's payload, always the caller's own data: their spend against monthly budget, their topics with
// this month's scan stats and costs, their subscriptions, and the invitations they sent
import type { ActivityResponse, ActivityScan, ActivityTopic, SubscriptionRow } from "@shared/contracts"
import { and, count, desc, eq, gte, inArray, ne, or, sql } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../db"
import {
	audienceMembers,
	audiences,
	scans,
	subscriptions,
	topicEmailSends,
	topicInvites,
	topics,
	users,
} from "../db/schema"
import { effectiveBudgetCents, isAdminRole, isAllowed, monthlySpendDollars } from "./authorization"
import type { AppEnv } from "./currentUser"
import { startOfUtcMonth } from "./topic/quotas"

// the owner's topic rows that toActivityTopics reads
type TopicRow = {
	id: string
	name: string
	visibility: ActivityTopic["visibility"]
	frequency: ActivityTopic["frequency"]
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
 * Assemble the Activity payload for the signed-in user
 */
export async function loadActivity(user: { id: string; email: string }): Promise<ActivityResponse> {
	// select the user's identity, budget inputs, spend key, and owned topics
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
	const ownedTopics = await db
		.select({
			id: topics.id,
			name: topics.name,
			visibility: topics.visibility,
			frequency: topics.frequency,
			createdAt: topics.createdAt,
			updatedAt: topics.updatedAt,
		})
		.from(topics)
		.where(eq(topics.ownerId, user.id))

	// the ids every query below filters on
	const ownedTopicIds = ownedTopics.map((topic) => topic.id)

	// every owned topic's scans this month in one query, sorted newest first
	const monthScanRows =
		ownedTopicIds.length > 0
			? await db
					.select({
						id: scans.id,
						topicId: scans.topicId,
						// the outcome and its recorded failure reason for the recap popover
						status: scans.status,
						error: scans.error,
						startedAt: scans.startedAt,
						finishedAt: scans.finishedAt,
						stoppedAt: scans.stoppedAt,
						// what the scan found, kept, and cost.
						foundCount: scans.foundCount,
						keptCount: scans.keptCount,
						costDollars: scans.cost,
					})
					.from(scans)
					.where(and(inArray(scans.topicId, ownedTopicIds), gte(scans.startedAt, startOfUtcMonth(new Date()))))
					.orderBy(desc(scans.startedAt))
			: []
	// the topic-id filter above already guarantees a live, owned topic. this narrows the column's nullable type to match
	const monthScans = monthScanRows.filter((scan): scan is typeof scan & { topicId: string } => scan.topicId !== null)

	// the active subscriber count per owned topic. unsubscribing deactivates the row instead of deleting it, so only active rows count
	// the join to the topic is what drops the owner's own row out
	const subscriberRows =
		ownedTopicIds.length > 0
			? await db
					.select({ topicId: subscriptions.topicId, count: count() })
					.from(subscriptions)
					.innerJoin(topics, eq(subscriptions.topicId, topics.id))
					// count only other subscribers, so the owner's own row never inflates their topic's count
					.where(
						and(
							inArray(subscriptions.topicId, ownedTopicIds),
							eq(subscriptions.isActive, true),
							sql`${subscriptions.subscriberUserId} is distinct from ${topics.ownerId}`,
						),
					)
					.groupBy(subscriptions.topicId)
			: []
	const subscriberCountByTopic = new Map(subscriberRows.map((row) => [row.topicId, row.count]))

	// this month's email count sent to the topic owner grouped by topic
	const emailSendRows =
		ownedTopicIds.length > 0
			? await db
					.select({ topicId: topicEmailSends.topicId, count: count() })
					.from(topicEmailSends)
					.innerJoin(topics, eq(topicEmailSends.topicId, topics.id))
					.where(
						and(
							inArray(topicEmailSends.topicId, ownedTopicIds),
							eq(topicEmailSends.recipientUserId, topics.ownerId),
							gte(topicEmailSends.sentAt, startOfUtcMonth(new Date())),
						),
					)
					.groupBy(topicEmailSends.topicId)
			: []
	const emailCountByTopic = new Map(emailSendRows.map((row) => [row.topicId, row.count]))

	// the owner's own subscription row on each topic they own, which is what the Emails column toggles.
	// a topic with no row for the owner reads as on below, matching the column default
	const ownerEmailRows =
		ownedTopicIds.length > 0
			? await db
					.select({ topicId: subscriptions.topicId, isEmailEnabled: subscriptions.isEmailEnabled })
					.from(subscriptions)
					.where(and(inArray(subscriptions.topicId, ownedTopicIds), eq(subscriptions.subscriberUserId, user.id)))
			: []
	const emailEnabledByTopic = new Map(ownerEmailRows.map((row) => [row.topicId, row.isEmailEnabled]))

	// this month's spend divided into what produced it.
	const monthlySpend = await monthlySpendDollars(user.id)

	// the topics the user subscribes to, directly or through an audience, on topics they do not own.
	// active and inactive alike, and audienceName is null on a direct subscription
	const memberAudiences = db
		.select({ audienceId: audienceMembers.audienceId })
		.from(audienceMembers)
		.where(eq(audienceMembers.userId, user.id))
	const subscriptionRows = await db
		.select({
			topicId: topics.id,
			name: topics.name,
			ownerName: users.name,
			visibility: topics.visibility,
			subscribedAt: subscriptions.createdAt,
			isActive: subscriptions.isActive,
			isEmailEnabled: subscriptions.isEmailEnabled,
			audienceName: audiences.name,
		})
		.from(subscriptions)
		.innerJoin(topics, eq(subscriptions.topicId, topics.id))
		.innerJoin(users, eq(topics.ownerId, users.id))
		.leftJoin(audiences, eq(subscriptions.subscriberAudienceId, audiences.id))
		// the subscriber is the user directly or one of their audiences, to topics someone else owns
		.where(
			and(
				ne(topics.ownerId, user.id),
				or(eq(subscriptions.subscriberUserId, user.id), inArray(subscriptions.subscriberAudienceId, memberAudiences)),
			),
		)

	// the invitations the user sent on their own topics, and whether each invitee subscribed.
	// an invite names an email, so the account join is a left join: an invitee might not have an account yet
	const inviteRows = await db
		.select({
			topicId: topicInvites.topicId,
			name: topics.name,
			inviteeEmail: topicInvites.email,
			invitedAt: topicInvites.invitedAt,
			subscribedAt: subscriptions.createdAt,
			// the invitee's account fields, all null until the invited address has an account
			inviteeUserId: users.id,
			inviteeUsername: users.username,
			inviteeAvatarSource: users.avatarSource,
		})
		.from(topicInvites)
		.innerJoin(topics, eq(topicInvites.topicId, topics.id))
		.leftJoin(users, eq(users.email, topicInvites.email))
		.leftJoin(
			subscriptions,
			and(eq(subscriptions.topicId, topicInvites.topicId), eq(subscriptions.subscriberUserId, users.id)),
		)
		.where(eq(topics.ownerId, user.id))

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
		topics: toActivityTopics(ownedTopics, monthScans, subscriberCountByTopic, emailEnabledByTopic, emailCountByTopic),
		subscriptions: toSubscriptionRows(subscriptionRows),
		invites: inviteRows.map((row) => ({
			topicId: row.topicId,
			name: row.name,
			inviteeEmail: row.inviteeEmail,
			// the invitee's identity when the invited address has an account, else null
			invitee:
				row.inviteeUserId && row.inviteeUsername
					? { userId: row.inviteeUserId, username: row.inviteeUsername, avatarSource: row.inviteeAvatarSource }
					: null,
			invitedAt: row.invitedAt.toISOString(),
			subscribedAt: row.subscribedAt?.toISOString() ?? null,
		})),
	}
}

/**
 * One row per Topic, preferring the direct subscription when the user also holds an audience subscription,
 * since the direct row is the only one their Active, Emails, and Delete controls can act on.
 */
export function toSubscriptionRows(
	subscriptionRows: (Omit<SubscriptionRow, "subscribedAt"> & { subscribedAt: Date })[],
): SubscriptionRow[] {
	const subscriptionRowsByTopic = new Map<string, (typeof subscriptionRows)[number]>()
	for (const subscriptionRow of subscriptionRows) {
		// a direct subscription row displaces an audience subscription row and never the other way round
		const existingSubscriptionRow = subscriptionRowsByTopic.get(subscriptionRow.topicId)
		if (
			!existingSubscriptionRow ||
			(existingSubscriptionRow.audienceName !== null && subscriptionRow.audienceName === null)
		) {
			subscriptionRowsByTopic.set(subscriptionRow.topicId, subscriptionRow)
		}
	}
	// one row per topic now, with the date encoded for the serialization
	return [...subscriptionRowsByTopic.values()].map((subscriptionRow) => ({
		...subscriptionRow,
		subscribedAt: subscriptionRow.subscribedAt.toISOString(),
	}))
}

/**
 * Build the Activity rows from the owner topics, their scans this month, and their subscriber counts
 */
export function toActivityTopics(
	topicRows: TopicRow[],
	scanRows: ScanRow[],
	subscriberCountByTopic: Map<string, number>,
	emailEnabledByTopic: Map<string, boolean> = new Map(),
	emailCountByTopic: Map<string, number> = new Map(),
): ActivityTopic[] {
	// group each topic's scans once, then build every row
	const scansByTopic = Map.groupBy(scanRows, (scan) => scan.topicId)
	return topicRows.map((topic) => {
		const topicScans = scansByTopic.get(topic.id) ?? []
		return {
			id: topic.id,
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
	// reject a signed-out caller
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
	return targetUser ? context.json(await loadActivity(targetUser)) : context.json({ error: "not found" }, 404)
})
