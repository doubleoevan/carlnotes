// the Activity page's payload, the user's own or, for an admin, any user's
import { toAvatarKeyVersion, toAvatarVersion } from "@shared/avatars"
import type { ActivityResponse, SubscriptionRow } from "@shared/contracts/activity"
import type { PodcastEpisodeSummary } from "@shared/contracts/podcast"
import type { TeamIdentity } from "@shared/contracts/teams"
import { toCentsFromDollars } from "@shared/plans"
import { and, desc, eq, gt, isNotNull, isNull, ne, notInArray, or, sql } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../db"
import { loadMonthlyBudgetCutoffs } from "../db/monthlyBudgetCutoffs"
import { invites } from "../db/schema/invites"
import { teamMembers, teams } from "../db/schema/teams"
import { subscriptions, topics } from "../db/schema/topics"
import { users } from "../db/schema/users"
import { loadOwnedTopics } from "./activityTopics"
import { isAdminRole, isAllowed, monthlySpendDollars, userBudgetCents } from "./authorization"
import { toProfileIdentity, withAvatarVersion } from "./avatars"
import type { AppEnv } from "./currentUser"
import { loadLatestPodcastEpisodeSummaries } from "./podcast/podcastEpisodeShapes"

// the subscription row fields that the queries read, with the subscribed time as a date
export type SubscriptionRowFields = Omit<SubscriptionRow, "subscribedAt" | "latestPodcastEpisode"> & {
	subscribedAt: Date
}

/**
 * Assembles the user's Activity payload for the signed-in user: the user, or an admin viewing the user's activity.
 */
export async function loadActivity(
	user: { id: string; email: string },
	signedInUserId: string,
): Promise<ActivityResponse> {
	// select the user's identity, budget inputs, and litellm key
	const [userRow] = await db
		.select({
			litellmVirtualKey: users.litellmVirtualKey,
			role: users.role,
			plan: users.plan,
			budgetOverrideCents: users.budgetOverrideCents,
			username: users.username,
			avatarSource: users.avatarSource,
			avatarKey: users.avatarKey,
		})
		.from(users)
		.where(eq(users.id, user.id))

	// this month's spend divided into what produced it, and the user's monthly budget cutoffs
	const [monthlySpend, monthlyBudgetCutoffs] = await Promise.all([
		monthlySpendDollars(user.id),
		loadMonthlyBudgetCutoffs(user.id),
	])

	// the user's subscriptions on topics they do not own, both active and inactive alike
	const subscriptionRows = await db
		.select({
			topicId: topics.id,
			name: topics.name,
			owner: {
				userId: users.id,
				username: users.username,
				avatarSource: users.avatarSource,
				avatarKey: users.avatarKey,
			},
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
			// the invitee's account, null until the invitation names or resolves to one
			invitee: {
				userId: users.id,
				username: users.username,
				avatarSource: users.avatarSource,
				avatarKey: users.avatarKey,
			},
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

	// the subscriptions and the pending invitations, each with the latest podcast episode that the signed-in user may
	// listen to
	const subscriptionRowFields: SubscriptionRowFields[] = [
		// convert the joined owner and team columns to their identities before the rows merge
		...subscriptionRows.map((subscriptionRow) => ({
			...subscriptionRow,
			owner: withAvatarVersion(subscriptionRow.owner),
			team: toTeamIdentity(subscriptionRow.team),
		})),
		...(await loadInvitedTopicSubscriptions(user)),
	]
	const subscriptionTopicRows = subscriptionRowFields.map((subscriptionRow) => ({
		id: subscriptionRow.topicId,
		name: subscriptionRow.name,
		ownerId: subscriptionRow.owner.userId,
		visibility: subscriptionRow.visibility,
	}))
	const subscriptionPodcastEpisodeByTopic = await loadLatestPodcastEpisodeSummaries(
		subscriptionTopicRows,
		signedInUserId,
	)

	return {
		// whose activity this is, for the page's profile link
		user: {
			userId: user.id,
			username: userRow?.username ?? "",
			avatarSource: userRow?.avatarSource ?? null,
			avatarVersion: toAvatarVersion(userRow ?? {}),
		},
		scanSpendCents: toCentsFromDollars(monthlySpend.scanDollars),
		chatSpendCents: toCentsFromDollars(monthlySpend.chatDollars),
		podcastEpisodeSpendCents: toCentsFromDollars(monthlySpend.podcastEpisodeDollars),
		budgetCents: userBudgetCents({
			isAdmin: isAdminRole(userRow?.role),
			plan: userRow?.plan ?? "free",
			budgetOverrideCents: userRow?.budgetOverrideCents ?? null,
		}),
		monthlyBudgetCutoffs,
		topics: await loadOwnedTopics({ userId: user.id, signedInUserId }),
		subscriptions: toSubscriptionRows(subscriptionRowFields, subscriptionPodcastEpisodeByTopic),
		invites: inviteRows.map((inviteRow) => ({
			inviteId: inviteRow.inviteId,
			topicId: inviteRow.topicId ?? "",
			name: inviteRow.name,
			// the email address if the sender typed one, null on a username invitation
			inviteeEmail: inviteRow.inviteeEmail,
			invitee: toProfileIdentity(inviteRow.invitee),
			invitedAt: inviteRow.invitedAt.toISOString(),
			subscribedAt: inviteRow.subscribedAt?.toISOString() ?? null,
		})),
	}
}

/**
 * Loads the topic invitations waiting for the user's answer, shaped as the subscription rows they will become.
 */
export async function loadInvitedTopicSubscriptions(user: {
	id: string
	email: string
}): Promise<SubscriptionRowFields[]> {
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
			owner: {
				userId: users.id,
				username: users.username,
				avatarSource: users.avatarSource,
				avatarKey: users.avatarKey,
			},
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
		owner: withAvatarVersion(scanRow.owner),
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
}): TeamIdentity | null {
	// a private team is named to its own members alone, so an outside subscriber or invitee sees the owner instead
	if (team.teamId === null || team.name === null || (!team.isPublic && team.memberUserId === null)) {
		return null
	}
	return { teamId: team.teamId, name: team.name, avatarVersion: toAvatarKeyVersion(team.avatarKey) }
}

/**
 * The subscription rows with subscribedAt as the iso string the payload sends, and each topic's latest podcast episode.
 */
export function toSubscriptionRows(
	subscriptionRows: SubscriptionRowFields[],
	latestPodcastEpisodeByTopic: Map<string, PodcastEpisodeSummary> = new Map(),
): SubscriptionRow[] {
	return subscriptionRows.map((subscriptionRow) => ({
		...subscriptionRow,
		subscribedAt: subscriptionRow.subscribedAt.toISOString(),
		latestPodcastEpisode: latestPodcastEpisodeByTopic.get(subscriptionRow.topicId) ?? null,
	}))
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
		return context.json(await loadActivity({ id: user.id, email: user.email }, user.id))
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
	return targetUser ? context.json(await loadActivity(targetUser, user.id)) : context.json({ error: "not found" }, 404)
})
