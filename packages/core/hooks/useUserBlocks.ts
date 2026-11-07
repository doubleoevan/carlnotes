import { fetchUserBlocks, sendUserUnblock } from "@carlnotes/client/userBlockClient"
import type { UserBlock } from "@carlnotes/contracts/userBlocks"
import { useCallback, useEffect, useRef, useState } from "react"

// the user's user block list, and the unblock that shortens the list
export type UserBlocksList = {
	userBlocks: UserBlock[]
	isLoading: boolean
	hasError: boolean
	unblockingUserIds: Set<string>
	retry: () => void
	unblock: (blockedUserId: string) => Promise<boolean>
}

/**
 * Loads the signed-in user's blocked users and removes one from the list once the server accepts the unblock.
 */
export function useUserBlocks(): UserBlocksList {
	const [userBlocks, setUserBlocks] = useState<UserBlock[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [hasError, setHasError] = useState(false)
	const [unblockingUserIds, setUnblockingUserIds] = useState<Set<string>>(new Set())
	const unblockingUserIdsRef = useRef(new Set<string>())

	// load the list, and show the retry if the load fails
	const loadUserBlocks = useCallback((): void => {
		setIsLoading(true)
		setHasError(false)
		fetchUserBlocks()
			.then(setUserBlocks)
			.catch(() => setHasError(true))
			.finally(() => setIsLoading(false))
	}, [])

	// one load per mount
	useEffect(loadUserBlocks, [loadUserBlocks])

	// send the unblock, then drop the row once the server accepts. a second press during the send does nothing
	const unblock = useCallback(async (blockedUserId: string): Promise<boolean> => {
		if (unblockingUserIdsRef.current.has(blockedUserId)) {
			return false
		}
		unblockingUserIdsRef.current.add(blockedUserId)
		setUnblockingUserIds(new Set(unblockingUserIdsRef.current))

		// the unblock, and the row's removal
		const isUnblocked = await sendUserUnblock(blockedUserId)
			.then(() => true)
			.catch(() => false)
		if (isUnblocked) {
			setUserBlocks((current) => current.filter((userBlock) => userBlock.id !== blockedUserId))
		}

		// clear the pending press
		unblockingUserIdsRef.current.delete(blockedUserId)
		setUnblockingUserIds(new Set(unblockingUserIdsRef.current))
		return isUnblocked
	}, [])

	// the list and its controls
	return { userBlocks, isLoading, hasError, unblockingUserIds, retry: loadUserBlocks, unblock }
}
