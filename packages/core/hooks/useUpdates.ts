import { requestUpdates } from "@carlnotes/client/updatesClient"
import type { UpdatesMinutes, UpdatesResponse } from "@carlnotes/contracts/updates"
import { type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

// the query key an updates list is cached under, and how long back navigation still finds it
export const UPDATES_QUERY_KEY = "updates"
const UPDATES_CACHE_MS = 60 * 60_000

// the signed-in user, and the length and the one Topic of the list
type UpdatesOptions = { userId: string | null; minutes: UpdatesMinutes; topicId?: string }

/**
 * Reads an updates list for a user, a length, and an optional Topic. A remount or back navigation keeps the list it
 * has, and a failed request waits for the user's retry.
 */
export function useUpdates({ userId, minutes, topicId }: UpdatesOptions): UseQueryResult<UpdatesResponse> {
	return useQuery({
		queryKey: [UPDATES_QUERY_KEY, userId, minutes, topicId],
		queryFn: () => requestUpdates({ minutes, topicId }),
		enabled: userId !== null,
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: UPDATES_CACHE_MS,
	})
}

/**
 * Returns the function that refreshes the topic updates lists of a length, the unread Findings fitted to that many
 * minutes. A list on screen requests a new one at once, and any other list requests a new one when it next opens.
 */
export function useTopicUpdates(): (minutes: UpdatesMinutes) => void {
	const queryClient = useQueryClient()
	return useCallback(
		(minutes) =>
			void queryClient.resetQueries({
				predicate: ({ queryKey }) => queryKey[0] === UPDATES_QUERY_KEY && queryKey[2] === minutes,
			}),
		[queryClient],
	)
}
