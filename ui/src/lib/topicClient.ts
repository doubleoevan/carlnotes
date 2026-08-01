// the typed Hono RPC client for every topic route. the api's AppType is imported as types-only, so no api code ends up in the ui bundle
import {
	manualScanResponse,
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

// same-origin client. in dev vite forwards /api to the Hono server,
// and in prod one service serves both the ui and the api
const client = hc<AppType>(window.location.origin)

// tells the reader a write was rejected. every caller reloads the page afterward, so the screen shows the
// unchanged truth and the click just looks ignored. isBackground skips the toast for a write the reader
// never asked for by itself.
// TODO: report these once the ui has its own Sentry client, since shared/monitoring is server-only
async function reportFailedWrite(request: Promise<Response>, action: string, isBackground = false): Promise<void> {
	// a rejected request never reaches a Response at all, so an offline reader is told the same as a refused write
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

	// the log carries the detail, the toast only tells the reader it did not stick
	console.error(`${action} failed: ${response.status} ${await response.text()}`)
	reportRejectedWrite(isBackground)
}

// the one message a failed write shows, skipped for a write the reader never asked for by itself
function reportRejectedWrite(isBackground: boolean): void {
	if (!isBackground) {
		toast.error("That didn't save. Carl suggests trying again.")
	}
}

// fetch the topic feed. includeConsumed adds already consumed topic findings
export async function fetchTopicFeed(includeConsumed: boolean): Promise<TopicFeedResponse> {
	const response = await client.api["topic-feed"].$get({ query: includeConsumed ? { all: "true" } : {} })
	return topicFeedResponse.parse(await response.json())
}

// set or clear a topic finding's thumbs up or thumbs down rating
export async function sendTopicFindingRating(findingId: string, rating: "up" | "down" | null): Promise<void> {
	await reportFailedWrite(
		client.api["topic-findings"][":id"].rating.$post({ param: { id: findingId }, json: { rating } }),
		"rate topic finding",
	)
}

// mark or unmark a topic finding consumed for the current user
export async function sendTopicFindingConsumed(findingId: string, isConsumed: boolean): Promise<void> {
	await reportFailedWrite(
		client.api["topic-findings"][":id"].consume.$post({ param: { id: findingId }, json: { isConsumed } }),
		"mark topic finding consumed",
	)
}

// bookmark or unbookmark a topic finding for the current user, keeping it past the max-results filter
export async function sendTopicFindingBookmark(findingId: string, isBookmarked: boolean): Promise<void> {
	await reportFailedWrite(
		client.api["topic-findings"][":id"].bookmark.$post({ param: { id: findingId }, json: { isBookmarked } }),
		"bookmark topic finding",
	)
}

// record that the user opened a topic finding resource. marks it consumed and increments its view count.
// it rides along with opening the link, so a failure stays silent rather than toasting at someone already reading
export async function sendTopicFindingOpened(findingId: string): Promise<void> {
	await reportFailedWrite(
		client.api["topic-findings"][":id"].view.$post({ param: { id: findingId } }),
		"record topic finding view",
		true,
	)
}

// fetch one topic's page payload. null when the topic is missing or not visible to this user
export async function fetchTopicPage(topicId: string): Promise<TopicResponse | null> {
	const response = await client.api.topics[":id"].$get({ param: { id: topicId } })
	if (!response.ok) {
		return null
	}
	return topicResponse.parse(await response.json())
}

// create a topic and return its id. throws on a rejected create, including a reached topic cap
export async function sendTopicCreate(payload: UpdateTopicPayload): Promise<string> {
	const response = await client.api.topics.$post({ json: payload })
	if (!response.ok) {
		throw new Error(`topic create failed: ${response.status}`)
	}
	return topicCreateResponse.parse(await response.json()).id
}

// save the edit modal's changes to a topic. throws on a rejected save so the modal can surface it
export async function sendTopicUpdate(topicId: string, payload: UpdateTopicPayload): Promise<void> {
	const response = await client.api.topics[":id"].$patch({ param: { id: topicId }, json: payload })
	if (!response.ok) {
		throw new Error(`topic update failed: ${response.status}`)
	}
}

// delete a topic and everything hanging off it. throws on a rejected delete
export async function sendTopicDelete(topicId: string): Promise<void> {
	const response = await client.api.topics[":id"].$delete({ param: { id: topicId } })
	if (!response.ok) {
		throw new Error(`topic delete failed: ${response.status}`)
	}
}

// activate, reactivate or deactivate the current user's subscription on a topic. deactivating keeps the row
export async function sendTopicSubscription(topicId: string, isSubscribed: boolean): Promise<void> {
	await reportFailedWrite(
		client.api.topics[":id"].subscription.$post({ param: { id: topicId }, json: { isSubscribed } }),
		"update topic subscription",
	)
}

// permanently remove the current user's subscription row on a topic, distinct from deactivating it
export async function sendSubscriptionDelete(topicId: string): Promise<void> {
	await reportFailedWrite(
		client.api.topics[":id"].subscription.$delete({ param: { id: topicId } }),
		"delete topic subscription",
	)
}

// turn the current user's email preference for a topic subscription on or off
export async function sendSubscriptionEmail(topicId: string, isEmailEnabled: boolean): Promise<void> {
	await reportFailedWrite(
		client.api.topics[":id"]["subscription-email"].$post({ param: { id: topicId }, json: { isEmailEnabled } }),
		"update subscription email preference",
	)
}

// trigger a manual scan. returns the manual scans left today, or null when the api rejected the request
export async function sendManualScan(topicId: string): Promise<number | null> {
	const response = await client.api.topics[":id"].scan.$post({ param: { id: topicId } })
	if (!response.ok) {
		return null
	}
	return manualScanResponse.parse(await response.json()).remaining
}

// upload one attachment file to a topic. plain fetch because the route reads multipart form data, which the typed client cannot carry
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

// add an attachment to a topic by fetching a url's content. throws on a rejected ingest so the modal can surface it
export async function sendAttachmentUrl(topicId: string, url: string): Promise<void> {
	const response = await client.api.topics[":id"].attachments.url.$post({ param: { id: topicId }, json: { url } })
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as { error?: string } | null
		throw new Error(body?.error ?? `attachment url failed: ${response.status}`)
	}
}

// replace an attachment's generated context, the text that steers every later scan. throws on a rejected edit
export async function sendAttachmentContext(attachmentId: string, context: string): Promise<void> {
	const response = await client.api.attachments[":id"].context.$patch({
		param: { id: attachmentId },
		json: { context },
	})
	if (!response.ok) {
		throw new Error(`attachment context update failed: ${response.status}`)
	}
}

// remove an attachment from a topic. throws on a rejected delete
export async function sendAttachmentDelete(attachmentId: string): Promise<void> {
	const response = await client.api.attachments[":id"].$delete({ param: { id: attachmentId } })
	if (!response.ok) {
		throw new Error(`attachment delete failed: ${response.status}`)
	}
}
