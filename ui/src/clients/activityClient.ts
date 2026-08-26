// the typed api client for the activity routes. AppType is imported types-only, so no api code enters the ui bundle
import type { ActivityResponse } from "@shared/contracts"
import { hc } from "hono/client"
import type { AppType } from "../../../api"

// same-origin api client, like topicClient. in dev vite forwards /api to the Hono server
const apiClient = hc<AppType>(window.location.origin)

// the activity payload: monthly spend against budget, owned topics, subscriptions, and sent invitations
export async function fetchActivity(userId?: string): Promise<ActivityResponse> {
	const response = await apiClient.api.activity.$get({ query: userId ? { userId } : {} })
	if (!response.ok) {
		throw new Error(`activity failed: ${response.status}`)
	}
	return (await response.json()) as ActivityResponse
}

// delete one invitation on a topic the user owns, which drops that invitee's subscription with it
export async function sendDeleteTopicInvite(topicId: string, inviteId: string): Promise<void> {
	const response = await apiClient.api.topics[":id"].invite.$delete({ param: { id: topicId }, json: { inviteId } })
	if (!response.ok) {
		throw new Error(`invite revoke failed: ${response.status}`)
	}
}

// answer a received invitation, the same way the join page answers its token
export async function sendAcceptInvite(
	inviteId: string,
): Promise<{ status: string; teamId?: string; topicId?: string }> {
	const response = await apiClient.api.invites[":id"].accept.$post({ param: { id: inviteId } })
	if (!response.ok) {
		throw new Error(`invite accept failed: ${response.status}`)
	}
	return (await response.json()) as { status: string; teamId?: string; topicId?: string }
}

// decline a received invitation. the sender isn't told
export async function sendDeclineInvite(inviteId: string): Promise<void> {
	const response = await apiClient.api.invites[":id"].decline.$post({ param: { id: inviteId } })
	if (!response.ok) {
		throw new Error(`invite decline failed: ${response.status}`)
	}
}
