// the block calls: block a user, unblock them, and read the user's block list
import { type BlockedUser, blockedUsersResponse } from "@carlnotes/contracts/blocks"
import { apiClient } from "./apiClient"

/**
 * Blocks a user for the signed-in user. Throws an error on a rejection.
 */
export async function sendBlockUser(blockedUserId: string): Promise<void> {
	const response = await apiClient().api.users[":id"].block.$post({ param: { id: blockedUserId } })
	if (!response.ok) {
		throw new Error(`block failed: ${response.status}`)
	}
}

/**
 * Removes the signed-in user's block of a user. Throws an error on a rejection.
 */
export async function sendUnblockUser(blockedUserId: string): Promise<void> {
	const response = await apiClient().api.users[":id"].block.$delete({ param: { id: blockedUserId } })
	if (!response.ok) {
		throw new Error(`unblock failed: ${response.status}`)
	}
}

/**
 * Reads the signed-in user's blocked people, newest block first. Throws an error on a rejection.
 */
export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
	const response = await apiClient().api.users.me.blocks.$get()
	if (!response.ok) {
		throw new Error(`block list failed: ${response.status}`)
	}
	return blockedUsersResponse.parse(await response.json()).blockedUsers
}
