import { updatesOpenerResponse, updatesRecapResponse } from "@carlnotes/contracts/updates"
import { apiClient, readApiResponse } from "./apiClient"

/**
 * Fetches the day's recap, or null without one. The read marks no Finding read.
 */
export async function fetchUpdatesRecap(): Promise<string | null> {
	const response = await apiClient().api.updates.recap.$get()

	// throw an error if the request fails
	if (!response.ok) {
		throw new Error(`updates recap failed: ${response.status}`)
	}
	return (await readApiResponse(updatesRecapResponse, response)).recap
}

/**
 * Fetches the recap the person's home shows today, written for the person if the day has none, or null without one.
 * Only an admin may read it.
 */
export async function fetchProfileUpdatesRecap(userId: string): Promise<string | null> {
	const response = await apiClient().api.profiles[":userId"].recap.$get({ param: { userId } })

	// throw an error if the request fails
	if (!response.ok) {
		throw new Error(`profile updates recap failed: ${response.status}`)
	}
	return (await readApiResponse(updatesRecapResponse, response)).recap
}

/**
 * Fetches the day's recap from its first route, as the 0.1.0 mobile app does, or null without one.
 * @public The frozen 0.1.0 contract names it. The current apps read the recap route, and it stays until 0.1.0 retires.
 */
export async function fetchUpdatesOpener(): Promise<string | null> {
	const response = await apiClient().api.updates.opener.$get()

	// throw an error if the request fails
	if (!response.ok) {
		throw new Error(`updates opener failed: ${response.status}`)
	}
	return (await readApiResponse(updatesOpenerResponse, response)).opener
}
