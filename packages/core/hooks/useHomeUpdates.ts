import type { UpdatesMinutes, UpdatesResponse } from "@carlnotes/contracts/updates"
import type { UseQueryResult } from "@tanstack/react-query"
import { useState } from "react"
import { applyUpdatesFindingChanges } from "../lib/topicFindingChanges"
import { type TopicFindingActions, useTopicFindingActions } from "./useTopicFindingActions"
import { useUpdates } from "./useUpdates"

// the length the home page's list starts at, the longest offered
const HOME_UPDATES_MINUTES: UpdatesMinutes = 30

/**
 * Holds the home page's list: its length, starting at 30 minutes, the list at that length with the row changes
 * that show at once, and the row actions.
 */
export function useHomeUpdates(userId: string | null): {
	minutes: UpdatesMinutes
	setMinutes: (minutes: UpdatesMinutes) => void
	updatesQuery: UseQueryResult<UpdatesResponse>
	updates: UpdatesResponse | undefined
	actions: TopicFindingActions
} {
	// the list at the chosen length
	const [minutes, setMinutes] = useState<UpdatesMinutes>(HOME_UPDATES_MINUTES)
	const updatesQuery = useUpdates({ userId, minutes })

	// a row's rating, bookmark, and read mark, which show at once and stay in the list
	const actions = useTopicFindingActions({ userId, shouldUpdateOptimistically: true })
	const updates = updatesQuery.data && applyUpdatesFindingChanges(updatesQuery.data, actions.pendingChanges)
	return { minutes, setMinutes, updatesQuery, updates, actions }
}
