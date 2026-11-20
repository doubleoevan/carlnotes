// the invitation filters: the invitations addressed to a user, and the topic invitations still waiting for their answer
import { and, eq, gt, isNotNull, isNull, notInArray, or, type SQL, type SQLWrapper } from "drizzle-orm"
import { toNotUserBlockedAuthorFilter } from "./contentFilters"
import { db } from "./index"
import { invites } from "./schema/invites"
import { subscriptions } from "./schema/topics"
import { users } from "./schema/users"

// the user's address and whether it is verified
export type UserEmail = { email: string; isEmailVerified: boolean }

/**
 * Loads the user's address and whether it is verified, or undefined for a missing user.
 */
export async function loadUserEmail(userId: string): Promise<UserEmail | undefined> {
	const [userEmail] = await db
		.select({ email: users.email, isEmailVerified: users.emailVerified })
		.from(users)
		.where(eq(users.id, userId))
	return userEmail
}

// the user an invitation may address, by id or by a verified address. a read of many users at once names the joined
// user's own columns
type InviteAddressedToUserOptions =
	| ({ userId: string } & UserEmail)
	| { userId: SQLWrapper; email: SQLWrapper; isEmailVerified: SQLWrapper }

// the joined `users` row as the user an invitation may address, for a read of many users at once
export const JOINED_USER_INVITE_ADDRESS = {
	userId: users.id,
	email: users.email,
	isEmailVerified: users.emailVerified,
} satisfies InviteAddressedToUserOptions

/**
 * The filter for the invitations addressed to a user. A username invitation matches by the invited user id, and an
 * email invitation matches by its address only for a verified user.
 */
export function toInviteAddressedToUserFilter({
	userId,
	email,
	isEmailVerified,
}: InviteAddressedToUserOptions): SQL | undefined {
	// a username invitation names the account outright
	const usernameInviteFilter = and(isNull(invites.email), eq(invites.invitedUserId, userId))

	// a loaded user's verification is known here, and a joined user's is read from its own column
	if (typeof isEmailVerified !== "boolean") {
		return or(usernameInviteFilter, and(eq(isEmailVerified, true), eq(invites.email, email)))
	}
	return isEmailVerified ? or(usernameInviteFilter, eq(invites.email, email)) : usernameInviteFilter
}

/**
 * The filter for the topic invitations waiting for a user's answer: addressed to the user, with no spent use, no
 * decline, and no passed expiry, for a topic the user does not subscribe to yet, from a person the user has not blocked.
 */
export function toPendingTopicInviteFilter(options: InviteAddressedToUserOptions): SQL | undefined {
	// the topics the user already subscribes to
	const subscribedTopicIdQuery = db
		.select({ topicId: subscriptions.topicId })
		.from(subscriptions)
		.where(eq(subscriptions.subscriberUserId, options.userId))
	return and(
		toInviteAddressedToUserFilter(options),
		isNotNull(invites.topicId),
		eq(invites.usedCount, 0),
		isNull(invites.declinedAt),
		or(isNull(invites.expiresAt), gt(invites.expiresAt, new Date())),
		notInArray(invites.topicId, subscribedTopicIdQuery),
		toNotUserBlockedAuthorFilter(options.userId, invites.invitedByUserId),
	)
}
