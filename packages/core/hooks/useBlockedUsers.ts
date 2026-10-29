import { fetchBlockedUsers, sendUnblockUser } from "@carlnotes/client/blockClient"
import type { BlockedUser } from "@carlnotes/contracts/blocks"
import { useCallback, useEffect, useState } from "react"

// the user's block list, and the unblock that shortens it
export type BlockedUsersList = {
	blockedUsers: BlockedUser[]
	isLoading: boolean
	hasError: boolean
	unblockingUserIds: Set<string>
	retry: () => void
	unblock: (blockedUserId: string) => Promise<boolean>
}

/**
 * Loads the signed-in user's blocked people and removes one from the list once the server accepts the unblock.
 */
export function useBlockedUsers(): BlockedUsersList {
	const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [hasError, setHasError] = useState(false)
	const [unblockingUserIds, setUnblockingUserIds] = useState<Set<string>>(new Set())

	// load the list, and show the retry if the load fails
	const loadBlockedUsers = useCallback((): void => {
		setIsLoading(true)
		setHasError(false)
		fetchBlockedUsers()
			.then(setBlockedUsers)
			.catch(() => setHasError(true))
			.finally(() => setIsLoading(false))
	}, [])

	// one load per mount
	useEffect(loadBlockedUsers, [loadBlockedUsers])

	// send the unblock, then drop the row once the server accepts. a second press during the send does nothing
	const unblock = useCallback(async (blockedUserId: string): Promise<boolean> => {
		let isPending = false
		setUnblockingUserIds((current) => {
			isPending = current.has(blockedUserId)
			return isPending ? current : new Set(current).add(blockedUserId)
		})

		// a press already in flight
		if (isPending) {
			return false
		}

		// the unblock, and the row's removal
		const isUnblocked = await sendUnblockUser(blockedUserId)
			.then(() => true)
			.catch(() => false)
		if (isUnblocked) {
			setBlockedUsers((current) => current.filter((blockedUser) => blockedUser.id !== blockedUserId))
		}

		// clear the pending press
		setUnblockingUserIds((current) => {
			const next = new Set(current)
			next.delete(blockedUserId)
			return next
		})
		return isUnblocked
	}, [])

	// the list and its controls
	return { blockedUsers, isLoading, hasError, unblockingUserIds, retry: loadBlockedUsers, unblock }
}
