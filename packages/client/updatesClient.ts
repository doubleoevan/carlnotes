import { updatesOpenerResponse } from "@carlnotes/contracts/updates"
import { apiClient, readApiResponse } from "./apiClient"

/**
 * Fetches the day's opener, or null without one. The read marks no Finding read.
 */
export async function fetchUpdatesOpener(): Promise<string | null> {
	const response = await apiClient().api.updates.opener.$get()

	// throw an error if the request fails
	if (!response.ok) {
		throw new Error(`updates opener failed: ${response.status}`)
	}
	return (await readApiResponse(updatesOpenerResponse, response)).opener
}

/**
 * Fetches the opener the person's home shows today, written for the person if the day has none, or null without one.
 * Only an admin may read it.
 */
export async function fetchProfileUpdatesOpener(userId: string): Promise<string | null> {
	const response = await apiClient().api.profiles[":userId"].opener.$get({ param: { userId } })

	// throw an error if the request fails
	if (!response.ok) {
		throw new Error(`profile updates opener failed: ${response.status}`)
	}
	return (await readApiResponse(updatesOpenerResponse, response)).opener
}
