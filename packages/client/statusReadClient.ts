// the api client for the status reads a page's poll sends in place of its page: a film's, a Topic Post Discussion's,
// and a Topic's latest Scan's. a public read is sent without credentials
import {
	type TopicPostDiscussionStatusRead,
	type TopicScanStatusRead,
	type TopicVideoStatusRead,
	topicPostDiscussionStatusRead,
	topicScanStatusRead,
	topicVideoStatusRead,
} from "@carlnotes/contracts/statusReads"
import type { z } from "zod"
import { type ApiResponse, apiClient, readApiResponse, toReadRequestInit } from "./apiClient"

// the id of the status read's subject, and whether it is read without credentials
type FetchStatusReadOptions = { id: string; isPublic: boolean }

/**
 * Fetches a podcast episode's film status, or null if the read fails.
 */
export function fetchTopicVideoStatus({ id, isPublic }: FetchStatusReadOptions): Promise<TopicVideoStatusRead | null> {
	return readStatusRead(
		topicVideoStatusRead,
		apiClient().api.status.episodes[":id"]["topic-video"].$get(
			{ param: { id } },
			{ init: toReadRequestInit({ isPublic }) },
		),
	)
}

/**
 * Fetches a Topic Post's newest discussion status, or null if the read fails.
 */
export function fetchTopicPostDiscussionStatus({
	id,
	isPublic,
}: FetchStatusReadOptions): Promise<TopicPostDiscussionStatusRead | null> {
	return readStatusRead(
		topicPostDiscussionStatusRead,
		apiClient().api.status["topic-posts"][":id"].discussion.$get(
			{ param: { id } },
			{ init: toReadRequestInit({ isPublic }) },
		),
	)
}

/**
 * Fetches a Topic's latest Scan with its counts and its newest podcast episode's status, or null if the read fails.
 */
export function fetchTopicScanStatus({ id, isPublic }: FetchStatusReadOptions): Promise<TopicScanStatusRead | null> {
	return readStatusRead(
		topicScanStatusRead,
		apiClient().api.status.topics[":id"].scan.$get({ param: { id } }, { init: toReadRequestInit({ isPublic }) }),
	)
}

// a status read from one api response, or null if the request or its parse fails
async function readStatusRead<Schema extends z.ZodType>(
	schema: Schema,
	statusReadRequest: Promise<ApiResponse>,
): Promise<z.output<Schema> | null> {
	const response = await statusReadRequest.catch(() => null)
	return response?.ok ? readApiResponse(schema, response).catch(() => null) : null
}
