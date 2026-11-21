// the api client for the invite page's head. the invite page has no page read of its own
import type { PageHead } from "@carlnotes/contracts/pageHead"
import { apiClient } from "./apiClient"

/**
 * A join page's head, or null if no live invite has that token.
 */
export async function fetchInvitePageHead(token: string): Promise<PageHead | null> {
	const response = await apiClient().api.invites[":token"].head.$get({ param: { token } })
	// return null for an invite the api does not have, and throw on any other failed response
	if (response.status === 404) {
		return null
	}
	if (!response.ok) {
		throw new Error(`the page head responded ${response.status}`)
	}
	return (await response.json()) as PageHead
}
