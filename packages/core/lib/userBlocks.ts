// the user block controls both apps share: the profile menu's Block or Unblock label, and the toggle behind it
import { sendUserBlock, sendUserUnblock } from "@carlnotes/client/userBlockClient"

// the labels of the profile menu's option, and of the report dialog's user block choice
const USER_BLOCK_LABEL = "Block"
const USER_UNBLOCK_LABEL = "Unblock"

// what a profile shows the person who blocked its owner
export const USER_BLOCKED_LABEL = "Blocked"

// the account page's section that lists blocked people, as its web anchor and its mobile section param
export const USER_BLOCKS_SECTION = "blocked-people"

/**
 * Returns the label of the report dialog's user block choice for one author.
 */
export function toUserBlockAuthorLabel(username: string): string {
	return `${USER_BLOCK_LABEL} @${username}`
}

/**
 * Returns the profile menu's Block or Unblock label for the user block's current state.
 */
export function toUserBlockLabel(isUserBlocked: boolean): string {
	return isUserBlocked ? USER_UNBLOCK_LABEL : USER_BLOCK_LABEL
}

/**
 * Blocks a user who is not blocked, or unblocks one who is. Throws an error on a rejection.
 */
export function toggleUserBlock({ userId, isUserBlocked }: { userId: string; isUserBlocked: boolean }): Promise<void> {
	return isUserBlocked ? sendUserUnblock(userId) : sendUserBlock(userId)
}
