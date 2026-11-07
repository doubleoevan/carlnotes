// the user block calls: block a user, unblock them, and read the user's list
import { type UserBlock, userBlocksResponse } from "@carlnotes/contracts/userBlocks"
import { apiClient, readApiResponse } from "./apiClient"

/**
 * Blocks a user for the signed-in user. Throws an error on a rejection.
 */
export async function sendUserBlock(blockedUserId: string): Promise<void> {
	const response = await apiClient().api.users[":id"].block.$post({ param: { id: blockedUserId } })
	if (!response.ok) {
		throw new Error(`block failed: ${response.status}`)
	}
}

/**
 * Removes the signed-in user's user block of a user. Throws an error on a rejection.
 */
export async function sendUserUnblock(blockedUserId: string): Promise<void> {
	const response = await apiClient().api.users[":id"].block.$delete({ param: { id: blockedUserId } })
	if (!response.ok) {
		throw new Error(`unblock failed: ${response.status}`)
	}
}

/**
 * Reads the signed-in user's blocked people, newest user block first. Throws an error on a rejection.
 */
export async function fetchUserBlocks(): Promise<UserBlock[]> {
	const response = await apiClient().api.users.me.blocks.$get()
	if (!response.ok) {
		throw new Error(`block list failed: ${response.status}`)
	}
	return (await readApiResponse(userBlocksResponse, response)).blockedUsers
}
