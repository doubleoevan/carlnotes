// the typed Hono RPC api client for every topic route
import {
	type ChatLinkPreview,
	type Invite,
	type InviteAcceptResponse,
	type InviteSource,
	inviteAcceptResponse,
	inviteCreateResponse,
	manualScanResponse,
	type SuggestSourcesPayload,
	type SuggestSourcesResponse,
	scanNote,
	suggestSourcesResponse,
	type TopicFeedResponse,
	type TopicResponse,
	topicCreateResponse,
	topicFeedResponse,
	topicResponse,
	type UpdateTopicPayload,
} from "@shared/contracts"
import { hc } from "hono/client"
import { toast } from "sonner"
import type { AppType } from "../../../api"

// same-origin api client
const apiClient = hc<AppType>(window.location.origin)

// tells the user a write was rejected
async function reportFailedWrite(request: Promise<Response>, action: string, isBackground = false): Promise<void> {
	// a rejected request never reaches a Response at all, so an offline user is told the same as a rejected write
	let response: Response
	try {
		response = await request
	} catch (error) {
		console.error(`${action} failed to reach the server`, error)
		reportRejectedWrite(isBackground)
		return
	}

	// the server answered, so only a rejected status is a failure from here
	if (response.ok) {
		return
	}

	// the log includes the detail. the toast only tells the user the write failed, not why.
	console.error(`${action} failed: ${response.status} ${await response.text()}`)
	reportRejectedWrite(isBackground)
}

// the one message a failed write shows, skipped for a write the user never asked for by itself
function reportRejectedWrite(isBackground: boolean): void {
	if (!isBackground) {
		toast.error("That didn't save. Carl suggests trying again.")
	}
}

// create an invite link for a topic
export async function sendCreateTopicInvite(topicId: string, source: InviteSource): Promise<Invite> {
	const response = await apiClient.api.topics[":id"].invites.$post({ param: { id: topicId }, json: { source } })
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as { error?: string } | null
		throw new Error(body?.error ?? `invite create failed: ${response.status}`)
	}
	return inviteCreateResponse.parse(await response.json()).invite
}

// revoke one of a topic's invites. every subscription already made through it stays
export async function sendRevokeInvite(topicId: string, inviteId: string): Promise<void> {
	const request = apiClient.api.topics[":id"].invites[":inviteId"].$delete({ param: { id: topicId, inviteId } })
	await reportFailedWrite(request, "invite revoke")
}

// accept a join token, which subscribes the signed-in user to the topic it opens
export async function sendAcceptInvite(token: string, turnstileToken: string): Promise<InviteAcceptResponse> {
	const response = await apiClient.api.invite[":token"].$post({ param: { token }, json: { turnstileToken } })
	if (!response.ok) {
		return { status: "unknown" }
	}
	return inviteAcceptResponse.parse(await response.json())
}

// the absolute url an invite token is handed out as, built against the origin the ui is served from
export function toInviteUrl(token: string): string {
	return `${window.location.origin}/invite/${token}`
}

// a user's exact words about a finding. recording only, so a failure is logged and dropped
export async function sendFindingFeedback(findingId: string, feedback: string): Promise<void> {
	const request = apiClient.api["topic-findings"][":id"].feedback.$post({
		param: { id: findingId },
		json: { feedback },
	})
	await reportFailedWrite(request, "finding feedback", true)
}

// fetch the topic feed. includeConsumed adds already consumed topic findings
export async function fetchTopicFeed(includeConsumed: boolean): Promise<TopicFeedResponse> {
	const response = await apiClient.api["topic-feed"].$get({ query: includeConsumed ? { all: "true" } : {} })
	return topicFeedResponse.parse(await response.json())
}

// the topics a team modal may offer to add
export async function fetchAddableTopics(excludeTeamId?: string): Promise<{ id: string; name: string }[]> {
	const response = await apiClient.api.topics.addable.$get({
		query: excludeTeamId ? { excludeTeam: excludeTeamId } : {},
	})
	if (!response.ok) {
		return []
	}
	return ((await response.json()) as { topics: { id: string; name: string }[] }).topics
}

// the link preview card for a topic finding's page, null if the page offers none or the visitor is signed out
export async function fetchTopicFindingLinkPreview(findingId: string): Promise<ChatLinkPreview | null> {
	const response = await apiClient.api["topic-findings"][":id"]["link-preview"].$get({ param: { id: findingId } })
	if (!response.ok) {
		return null
	}
	return ((await response.json()) as { linkPreview: ChatLinkPreview | null }).linkPreview
}

// set or clear a topic finding's thumbs up or thumbs down rating
export async function sendTopicFindingRating(findingId: string, rating: "up" | "down" | null): Promise<void> {
	await reportFailedWrite(
		apiClient.api["topic-findings"][":id"].rating.$post({ param: { id: findingId }, json: { rating } }),
		"rate topic finding",
	)
}

// mark or unmark a topic finding consumed for the current user
export async function sendTopicFindingConsumed(findingId: string, isConsumed: boolean): Promise<void> {
	await reportFailedWrite(
		apiClient.api["topic-findings"][":id"].consume.$post({ param: { id: findingId }, json: { isConsumed } }),
		"mark topic finding consumed",
	)
}

// bookmark or unbookmark a topic finding for the current user, keeping it past the max-results filter
export async function sendTopicFindingBookmark(findingId: string, isBookmarked: boolean): Promise<void> {
	await reportFailedWrite(
		apiClient.api["topic-findings"][":id"].bookmark.$post({ param: { id: findingId }, json: { isBookmarked } }),
		"bookmark topic finding",
	)
}

// record that the user opened a topic finding resource. marks it consumed and increments its view count.
export async function sendTopicFindingOpened(findingId: string): Promise<void> {
	await reportFailedWrite(
		apiClient.api["topic-findings"][":id"].view.$post({ param: { id: findingId } }),
		"record topic finding view",
		true,
	)
}

// what asking for a topic page got: the topic, the gate in front of it, or no such topic at all
export type TopicPageResult =
	| { status: "visible"; topic: TopicResponse }
	| { status: "gated"; topicName: string | null }
	| { status: "missing" }

// fetch one topic's page, or how it is gated if this user may not see it
export async function fetchTopicPage(topicId: string): Promise<TopicPageResult> {
	const response = await apiClient.api.topics[":id"].$get({ param: { id: topicId } })
	if (response.ok) {
		return { status: "visible", topic: topicResponse.parse(await response.json()) }
	}
	// a gated topic shows how it is gated. the values are checked instead of trusted
	const body = (await response.json().catch(() => null)) as { gatedVisibility?: unknown; topicName?: unknown } | null
	if (body?.gatedVisibility !== "invite") {
		return { status: "missing" }
	}
	return { status: "gated", topicName: typeof body?.topicName === "string" ? body.topicName : null }
}

/**
 * One scan's recap, or null if the scan is gone or the topic isn't visible.
 */
export async function fetchScanNote(scanId: string): Promise<string | null> {
	const response = await apiClient.api.scans[":id"].$get({ param: { id: scanId } })
	if (!response.ok) {
		return null
	}
	return scanNote.parse(await response.json()).scanSummary
}

// a topic save that the api rejected because the plan already hit its limit of topics on a daily schedule.
export class DailyTopicLimitError extends Error {
	constructor(limit: number) {
		super(`Carl runs ${limit} ${limit === 1 ? "topic" : "topics"} on a daily schedule for your plan.`)
	}
}

// ask for sources this topic could follow, each already confirmed readable by the api
export async function fetchSourceSuggestions(
	payload: SuggestSourcesPayload,
): Promise<SuggestSourcesResponse["sources"]> {
	const response = await apiClient.api.topics["suggest-sources"].$post({ json: payload })
	if (!response.ok) {
		throw new Error(`source suggestions failed: ${response.status}`)
	}
	return suggestSourcesResponse.parse(await response.json()).sources
}

// create a topic and return its id. throws an error on a rejected create, including a reached topic limit
export async function sendCreateTopic(payload: UpdateTopicPayload): Promise<string> {
	const response = await apiClient.api.topics.$post({ json: payload })
	if (!response.ok) {
		throw (await toTopicWriteError(response)) ?? new Error(`topic create failed: ${response.status}`)
	}
	return topicCreateResponse.parse(await response.json()).id
}

// save the edit modal's changes to a topic. throws an error on a rejected save so the modal can surface it
export async function sendUpdateTopic(topicId: string, payload: UpdateTopicPayload): Promise<void> {
	const response = await apiClient.api.topics[":id"].$patch({ param: { id: topicId }, json: payload })
	if (!response.ok) {
		throw (await toTopicWriteError(response)) ?? new Error(`topic update failed: ${response.status}`)
	}
}

// how a rejected topic write explains itself, or null if the body included no explanation to show
async function toTopicWriteError(response: Response): Promise<Error | null> {
	const body = (await response.json().catch(() => null)) as { dailyTopicLimit?: number; error?: string } | null
	// the daily topic limit gets its own error
	if (typeof body?.dailyTopicLimit === "number") {
		return new DailyTopicLimitError(body.dailyTopicLimit)
	}
	return typeof body?.error === "string" ? new Error(body.error) : null
}

// sets where a public topic sits in the Featured section, with zero clearing it
export async function sendTopicFeatureOrder(topicId: string, position: number): Promise<void> {
	const response = await apiClient.api.topics[":id"]["feature-order"].$patch({
		param: { id: topicId },
		json: { position },
	})
	if (!response.ok) {
		throw new Error(`topic feature order update failed: ${response.status}`)
	}
}

// delete a topic and everything hanging off it. throws an error on a rejected delete
export async function sendDeleteTopic(topicId: string): Promise<void> {
	const response = await apiClient.api.topics[":id"].$delete({ param: { id: topicId } })
	if (!response.ok) {
		throw new Error(`topic delete failed: ${response.status}`)
	}
}

// activate, reactivate or deactivate the current user's subscription on a topic. deactivating keeps the row
export async function sendTopicSubscription(topicId: string, isSubscribed: boolean): Promise<void> {
	await reportFailedWrite(
		apiClient.api.topics[":id"].subscription.$post({ param: { id: topicId }, json: { isSubscribed } }),
		"update topic subscription",
	)
}

// permanently remove the current user's subscription row on a topic, distinct from deactivating it
export async function sendDeleteSubscription(topicId: string): Promise<void> {
	await reportFailedWrite(
		apiClient.api.topics[":id"].subscription.$delete({ param: { id: topicId } }),
		"delete topic subscription",
	)
}

// turn the current user's email preference for a topic subscription on or off
export async function sendSubscriptionEmail(
	topicId: string,
	isEmailEnabled: boolean,
	// whose subscription to write, for an admin acting on somebody else's
	subscriberUserId?: string,
): Promise<void> {
	await reportFailedWrite(
		apiClient.api.topics[":id"]["subscription-email"].$post({
			param: { id: topicId },
			json: { isEmailEnabled, subscriberUserId },
		}),
		"update subscription email preference",
	)
}

// trigger a manual scan, returning the manual scans left today. throws an error with the api's own rejection reason
export async function sendManualScan(topicId: string): Promise<number> {
	const response = await apiClient.api.topics[":id"].scan.$post({ param: { id: topicId } })
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as { error?: string } | null
		throw new Error(body?.error ?? `scan request failed: ${response.status}`)
	}
	return manualScanResponse.parse(await response.json()).remainingScans
}

// stop the topic's running scan
export async function sendStopScan(topicId: string): Promise<void> {
	const response = await apiClient.api.topics[":id"].scan.stop.$post({ param: { id: topicId } })
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as { error?: string } | null
		throw new Error(body?.error ?? `stop request failed: ${response.status}`)
	}
}

// upload one attachment file to a topic
export async function uploadTopicAttachment(topicId: string, file: File): Promise<void> {
	// send the file as the form's file field
	const form = new FormData()
	form.append("file", file)
	const response = await fetch(`/api/topics/${topicId}/attachments`, { method: "POST", body: form })

	// surface the rejection reason from the api, falling back to the status
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as { error?: string } | null
		throw new Error(body?.error ?? `upload failed: ${response.status}`)
	}
}

// replace an attachment's generated context, the text every later scan reads. throws an error on a rejected edit
export async function sendAttachmentContext(attachmentId: string, context: string): Promise<void> {
	const response = await apiClient.api.attachments[":id"].context.$patch({
		param: { id: attachmentId },
		json: { context },
	})
	if (!response.ok) {
		throw new Error(`attachment context update failed: ${response.status}`)
	}
}

// remove an attachment from a topic. throws an error on a rejected delete
export async function sendDeleteAttachment(attachmentId: string): Promise<void> {
	const response = await apiClient.api.attachments[":id"].$delete({ param: { id: attachmentId } })
	if (!response.ok) {
		throw new Error(`attachment delete failed: ${response.status}`)
	}
}

// how a user invite was rejected, for the field to say inline
export type UserInviteRefusal = "unknown-username" | "not-accepting" | "limited" | "failed"

// create an invite that names a person, by username or email, for a topic or a team
export async function sendUserInvite(
	target: { topicId: string } | { teamId: string },
	address: { username: string } | { email: string },
): Promise<UserInviteRefusal | null> {
	const response = await ("topicId" in target
		? apiClient.api.topics[":id"].invites.user.$post({ param: { id: target.topicId }, json: address })
		: apiClient.api.teams[":id"].invites.user.$post({ param: { id: target.teamId }, json: address }))
	if (response.ok) {
		return null
	}

	// the named refusals pass through for the field's copy, and anything else reads as a plain failure
	const refusal = await response
		.json()
		.then((body) => (body as { error?: string }).error)
		.catch(() => undefined)

	// a refusal with no body falls through to the status check
	if (refusal === "unknown-username" || refusal === "not-accepting") {
		return refusal
	}
	return response.status === 429 ? "limited" : "failed"
}
