// the typed api client for the activity routes
import { type ActivityResponse, activityResponse } from "@carlnotes/contracts/activity"
import { type InviteAcceptResponse, inviteAcceptResponse, type TopicInviteBadge } from "@carlnotes/contracts/invites"
import { topicInviteBadgesResponse } from "@carlnotes/contracts/routeShapes"
import { apiClient, readApiResponse } from "./apiClient"

// the activity payload: monthly spend against budget, owned topics, subscriptions, and sent invitations
export async function fetchActivity(userId?: string): Promise<ActivityResponse> {
	const response = await apiClient().api.activity.$get({ query: userId ? { userId } : {} })
	if (!response.ok) {
		throw new Error(`activity failed: ${response.status}`)
	}
	return readApiResponse(activityResponse, response)
}

// delete one invitation on a topic the user owns, which drops that invitee's subscription with it
export async function sendDeleteTopicInvite(topicId: string, inviteId: string): Promise<void> {
	const response = await apiClient().api.topics[":id"].invite.$delete({ param: { id: topicId }, json: { inviteId } })
	if (!response.ok) {
		throw new Error(`invite delete failed: ${response.status}`)
	}
}

// answer a received invitation, the same way the join page answers its token
export async function sendAcceptInvite(inviteId: string): Promise<InviteAcceptResponse> {
	const response = await apiClient().api.invites[":id"].accept.$post({ param: { id: inviteId } })
	if (!response.ok) {
		throw new Error(`invite accept failed: ${response.status}`)
	}
	return readApiResponse(inviteAcceptResponse, response)
}

// decline a received invitation. the sender isn't told
export async function sendDeclineInvite(inviteId: string): Promise<void> {
	const response = await apiClient().api.invites[":id"].decline.$post({ param: { id: inviteId } })
	if (!response.ok) {
		throw new Error(`invite decline failed: ${response.status}`)
	}
}

/**
 * Fetches the topic invitations waiting for the user's response.
 */
export async function fetchTopicInviteBadges(): Promise<TopicInviteBadge[]> {
	const pendingInvitesResponse = await apiClient().api.invites.topics.pending.$get()
	if (!pendingInvitesResponse.ok) {
		throw new Error(`topic invite badges failed: ${pendingInvitesResponse.status}`)
	}
	return readApiResponse(topicInviteBadgesResponse, pendingInvitesResponse)
}
