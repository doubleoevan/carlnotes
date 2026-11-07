// the Blocked people card's story data, shared by the web and mobile stories
import type { UserBlock } from "@carlnotes/contracts/userBlocks"
import type { UserBlocksList } from "../hooks/useUserBlocks"
import { FIXTURE_DATE } from "./storyFixtures"

// the blocked person the Unblocking story shows in flight
export const BLOCKED_USER_ID = "user-carlos"

// two blocked people, newest first
export const BLOCKED_USER_FIXTURES: UserBlock[] = [
	{
		id: BLOCKED_USER_ID,
		username: "carlos",
		avatarSource: null,
		avatarVersion: null,
		blockedAt: FIXTURE_DATE.toISOString(),
	},
	{
		id: "user-evan",
		username: "evan",
		avatarSource: null,
		avatarVersion: null,
		blockedAt: new Date(FIXTURE_DATE.getTime() - 86_400_000).toISOString(),
	},
]

/**
 * Returns a loaded list, which each state story changes, with each app's story functions.
 */
export function toLoadedUserBlocksList({ retry, unblock }: Pick<UserBlocksList, "retry" | "unblock">): UserBlocksList {
	return {
		userBlocks: BLOCKED_USER_FIXTURES,
		isLoading: false,
		hasError: false,
		unblockingUserIds: new Set(),
		retry,
		unblock,
	}
}
