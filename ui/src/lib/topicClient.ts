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
import type { AppType } from "../../../api"

// same-origin client. in dev vite forwards /api to the Hono server,
// and in prod one service serves both the ui and the api
const client = hc<AppType>(window.location.origin)

// fetch the topic feed. includeConsumed adds already consumed topic findings
export async function fetchTopicFeed(includeConsumed: boolean): Promise<TopicFeedResponse> {
	const response = await client.api["topic-feed"].$get({ query: includeConsumed ? { all: "true" } : {} })
	return topicFeedResponse.parse(await response.json())
}

// set or clear a topic finding's thumbs up or thumbs down rating
export async function sendTopicFindingRating(findingId: string, rating: "up" | "down" | null): Promise<void> {
	await client.api["topic-findings"][":id"].rating.$post({ param: { id: findingId }, json: { rating } })
}

// mark or unmark a topic finding consumed for the current user
export async function sendTopicFindingConsumed(findingId: string, isConsumed: boolean): Promise<void> {
	await client.api["topic-findings"][":id"].consume.$post({ param: { id: findingId }, json: { isConsumed } })
}

// record that the user opened a topic finding resource. marks it consumed and increments its view count
export async function sendTopicFindingOpened(findingId: string): Promise<void> {
	await client.api["topic-findings"][":id"].view.$post({ param: { id: findingId } })
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

// subscribe or unsubscribe the current user on a topic
export async function sendTopicSubscription(topicId: string, isSubscribed: boolean): Promise<void> {
	await client.api.topics[":id"].subscription.$post({ param: { id: topicId }, json: { isSubscribed } })
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

// remove an attachment from a topic. throws on a rejected delete
export async function sendAttachmentDelete(attachmentId: string): Promise<void> {
	const response = await client.api.attachments[":id"].$delete({ param: { id: attachmentId } })
	if (!response.ok) {
		throw new Error(`attachment delete failed: ${response.status}`)
	}
}
