// the public profile: who a username belongs to, and the Topics they own.
import { toAvatarVersion } from "@carlnotes/contracts/avatars"
import type { ProfileResponse, Topic } from "@carlnotes/contracts/profiles"
import { SEARCH_MIN_CHARS, type UserSearchRow } from "@carlnotes/contracts/search"
import { toNormalizedUsername } from "@carlnotes/contracts/usernames"
import { type DbHandle, db } from "@carlnotes/db"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { and, countDistinct, eq, isNotNull, like, ne, sql } from "drizzle-orm"
import { Hono } from "hono"
import { isAllowed } from "./authorization"
import { withAvatarVersion } from "./avatars"
import { type AppEnv, currentUser } from "./currentUser"
import { loadProfileTeamStatuses, loadPublicTeams, loadTeamSummaries } from "./team/helpers"
import { toTopicTableRows } from "./topic/topicTableRows"

// the trimmed query and the most rows to read
type SearchUsersOptions = { query: string; limit: number }

/**
 * Returns the users whose username contains the query, matched on the normalized username and query, shorter names
 * first.
 */
export async function searchUsers({ query, limit }: SearchUsersOptions): Promise<UserSearchRow[]> {
	// normalized usernames are lowercase alphanumerics, so anything else in a query could only act as a LIKE wildcard
	const normalizedUsername = toNormalizedUsername(query).replaceAll(/[^a-z0-9]/g, "")
	// too short a username matches most of the table
	if (normalizedUsername.length < SEARCH_MIN_CHARS) {
		return []
	}

	// read the matching users and shape each as a search row with its avatar version
	const userRows = await toUserSearchQuery({ normalizedUsername, limit })
	return userRows.map((userRow) => {
		const user = withAvatarVersion(userRow)
		return {
			kind: "user",
			id: user.userId,
			name: user.username,
			path: `/profiles/${user.userId}`,
			date: null,
			count: null,
			user,
		}
	})
}

/**
 * Returns the username search's query, shorter names first.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
export function toUserSearchQuery({ normalizedUsername, limit }: { normalizedUsername: string; limit: number }) {
	return db
		.select({
			userId: users.id,
			username: users.username,
			avatarSource: users.avatarSource,
			avatarKey: users.avatarKey,
		})
		.from(users)
		.where(like(users.usernameNormalized, `%${normalizedUsername}%`))
		.orderBy(sql`length(${users.usernameNormalized})`, users.id)
		.limit(limit)
}

/**
 * A user's public profile by id, or null if there is no such user.
 * An owner viewing their own profile sees their private and invite topics, which are hidden for everyone else except an admin.
 */
export async function loadProfile(profileUserId: string, userId: string | null): Promise<ProfileResponse | null> {
	const [user] = await db
		.select({
			id: users.id,
			username: users.username,
			createdAt: users.createdAt,
			avatarSource: users.avatarSource,
			avatarKey: users.avatarKey,
		})
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
		avatarVersion: toAvatarVersion(user),
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
		: and(eq(topics.ownerId, profileUserId), eq(topics.visibility, "public"))
	const rows = await db
		.select({
			id: topics.id,
			name: topics.name,
			ownerId: topics.ownerId,
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

// the public profile routes: the profile page and the profile's team statuses
export const profilesRoute = new Hono<AppEnv>()
	// a profile does not require a session. but a session is required to show non-public topics to the owner or an admin.
	.get("/profiles/:userId", async (context) => {
		const profile = await loadProfile(context.req.param("userId"), currentUser(context))
		return profile ? context.json(profile) : context.json({ error: "not found" }, 404)
	})
	.get("/profiles/:userId/team-statuses", async (context) => {
		// the user's teams, each with the profile user's status there
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		return context.json({ teams: await loadProfileTeamStatuses(userId, context.req.param("userId")) })
	})
