import { type UpdatesResponse, type updatesPayload, updatesResponse } from "@carlnotes/contracts/updates"
import type { z } from "zod"
import { apiClient, readApiResponse } from "./apiClient"

/**
 * Requests an updates list. The server marks every Finding in it read.
 */
export async function requestUpdates(payload: z.input<typeof updatesPayload>): Promise<UpdatesResponse> {
	const response = await apiClient().api.updates.$post({ json: payload })

	// throw an error if the request fails
	if (!response.ok) {
		throw new Error(`updates list failed: ${response.status}`)
	}
	return readApiResponse(updatesResponse, response)
}
