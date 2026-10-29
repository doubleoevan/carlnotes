// the block controls both apps share: the profile menu's Block or Unblock label, and the toggle behind it
import { sendBlockUser, sendUnblockUser } from "@carlnotes/client/blockClient"

// the labels of the profile menu's option, and of the report dialog's block choice
export const BLOCK_LABEL = "Block"
export const UNBLOCK_LABEL = "Unblock"

/**
 * Returns the label of the report dialog's block choice for one author.
 */
export function toBlockAuthorLabel(username: string): string {
	return `${BLOCK_LABEL} @${username}`
}

/**
 * Returns the profile menu's Block or Unblock label for the block's current state.
 */
export function toBlockLabel(isBlocked: boolean): string {
	return isBlocked ? UNBLOCK_LABEL : BLOCK_LABEL
}

/**
 * Blocks a user who is not blocked, or unblocks one who is. Throws an error on a rejection.
 */
export function toggleUserBlock({ userId, isBlocked }: { userId: string; isBlocked: boolean }): Promise<void> {
	return isBlocked ? sendUnblockUser(userId) : sendBlockUser(userId)
}
