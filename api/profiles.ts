// the public profile: who a username belongs to, and the Topics they own.
import {
	type ProfileResponse,
	type Topic,
	USER_SEARCH_LIMIT,
	USER_SEARCH_MIN_CHARS,
	type UserSearchResult,
} from "@shared/contracts"
import { toNormalizedUsername } from "@shared/usernames"
import { and, countDistinct, eq, isNotNull, like, ne, sql } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../db"
import { subscriptions, topics, users } from "../db/schema"
import { isAllowed } from "./authorization"
import { type AppEnv, currentUser } from "./currentUser"
import { loadPublicTeams, loadTeamSummaries, loadTeamUpMenu } from "./team/helpers"
import { toTopicTableRows } from "./topic/helpers"
import { isShown } from "./topic/permissions"

// the transaction a caller is already inside, or the pool when there is none
type DbHandle = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Users whose username contains the search query. Matched on the normalized username and query.
 */
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
	// normalized usernames are lowercase alphanumerics, so anything else in a query could only act as a LIKE wildcard
	const normalizedUsername = toNormalizedUsername(query).replaceAll(/[^a-z0-9]/g, "")
	// too short a query matches most of the table, so it is not worth a search
	if (normalizedUsername.length < USER_SEARCH_MIN_CHARS) {
		return []
	}

	// sort shorter names first, so an exact match ranks above a name that contains it
	const userRows = await db
		.select({ userId: users.id, username: users.username, avatarSource: users.avatarSource })
		.from(users)
		.where(like(users.usernameNormalized, `%${normalizedUsername}%`))
		.orderBy(sql`length(${users.usernameNormalized})`)
		.limit(USER_SEARCH_LIMIT)
	return userRows.map((userRow) => ({
		userId: userRow.userId,
		username: userRow.username,
		avatarSource: userRow.avatarSource,
	}))
}

/**
 * A user's public profile by id, or null when there is no such user.
 * An owner viewing their own profile sees their private and invite topics, which are hidden for everyone else except an admin.
 */
export async function loadProfile(profileUserId: string, userId: string | null): Promise<ProfileResponse | null> {
	const [user] = await db
		.select({ id: users.id, username: users.username, createdAt: users.createdAt, avatarSource: users.avatarSource })
		.from(users)
		.where(eq(users.id, profileUserId))
	if (!user) {
		return null
	}

	// only an owner or an admin can see the non-public topics on the profile page
	const includesNonPublicTopics = userId === user.id || (userId !== null && (await isAllowed(userId, "admin:console")))
	return {
		userId: user.id,
		username: user.username,
		avatarSource: user.avatarSource,
		joinedAt: user.createdAt.toISOString(),
		subscriberCount: await countDistinctSubscribers(user.id),
		includesNonPublicTopics,
		topics: await loadProfileTopics(user.id, includesNonPublicTopics, userId),
		// a user's own profile shows every team they belong to.
		// other users only see the public teams they are a member of.
		teams: userId === user.id ? await loadTeamSummaries(user.id) : await loadPublicTeams(user.id),
	}
}

/**
 * How many distinct people subscribe to this user's public topics.
 */
export async function countDistinctSubscribers(userId: string, handle: DbHandle = db): Promise<number> {
	// every subscriber id across the owner's public topics
	const subscriberIds = handle
		.select({ subscriberId: subscriptions.subscriberUserId })
		.from(subscriptions)
		.innerJoin(topics, eq(topics.id, subscriptions.topicId))
		.where(and(eq(topics.ownerId, userId), eq(topics.visibility, "public"), eq(subscriptions.isActive, true)))
		.as("subscriber_ids")

	// count each person once, and never the owner following their own topic
	const [subscribers] = await handle
		.select({ subscriberCount: countDistinct(subscriberIds.subscriberId) })
		.from(subscriberIds)
		.where(and(isNotNull(subscriberIds.subscriberId), ne(subscriberIds.subscriberId, userId)))
	return subscribers?.subscriberCount ?? 0
}

// the topics the profile table shows
async function loadProfileTopics(
	profileUserId: string,
	includesNonPublicTopics: boolean,
	// the signed-in user, whose own email switch each row shows
	userId: string | null,
): Promise<Topic[]> {
	const visibleTopics = includesNonPublicTopics
		? eq(topics.ownerId, profileUserId)
		: and(eq(topics.ownerId, profileUserId), eq(topics.visibility, "public"), isShown)
	const rows = await db
		.select({
			id: topics.id,
			name: topics.name,
			visibility: topics.visibility,
			createdAt: topics.createdAt,
			updatedAt: topics.updatedAt,
			subscriberCount: topics.subscriberCount,
		})
		.from(topics)
		.where(visibleTopics)
		.orderBy(topics.createdAt)
	// the same row builder the team page uses, so that both tables show the same fields
	return toTopicTableRows(rows, userId)
}

// the public profile routes: the search bar's user suggestions and the profile page
export const profilesRoute = new Hono<AppEnv>()
	// public: who a user can find by name, for the search bar's user suggestions
	.get("/users", async (context) => {
		return context.json({ users: await searchUsers(context.req.query("q") ?? "") })
	})
	// a profile does not require a session. but a session is required to show non-public topics to the owner or an admin.
	.get("/profiles/:userId", async (context) => {
		const profile = await loadProfile(context.req.param("userId"), currentUser(context))
		return profile ? context.json(profile) : context.json({ error: "not found" }, 404)
	})
	.get("/profiles/:userId/team-up", async (context) => {
		// the user's teams with their team member status in each, for the Team Up menu
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		return context.json({ teams: await loadTeamUpMenu(userId, context.req.param("userId")) })
	})
