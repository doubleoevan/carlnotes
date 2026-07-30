// the typed client for the activity routes. AppType is imported types-only, so no api code enters the ui bundle
import type { ActivityResponse } from "@shared/contracts"
import { hc } from "hono/client"
import type { AppType } from "../../../api"

// same-origin client, like the topic client. in dev vite forwards /api to the Hono server
const client = hc<AppType>(window.location.origin)

// the caller's own activity payload: monthly spend against budget, owned topics, subscriptions, and sent invitations
export async function fetchActivity(): Promise<ActivityResponse> {
	const response = await client.api.activity.$get()
	if (!response.ok) {
		throw new Error(`activity failed: ${response.status}`)
	}
	return (await response.json()) as ActivityResponse
}

// withdraw one invitation on a topic the caller owns, which drops that invitee's subscription with it
export async function sendInviteDelete(topicId: string, email: string): Promise<void> {
	const response = await client.api.topics[":id"].invite.$delete({ param: { id: topicId }, json: { email } })
	if (!response.ok) {
		throw new Error(`invite revoke failed: ${response.status}`)
	}
}
