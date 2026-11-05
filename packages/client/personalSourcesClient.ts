// sender-only Personal sources reads and explicit deletions, shared by web and mobile
import {
	type PersonalSourceEntryPage,
	type PersonalSourcesImportResult,
	type PersonalSourceTitlePage,
	personalSourceEntryPage,
	personalSourcesImportResult,
	personalSourceTitlePage,
	type TopicPersonalSources,
	topicPersonalSources,
} from "@carlnotes/contracts/personalSources"
import {
	type PersonalSourcesEmailSetupResponse,
	personalSourcesAiAgentRecommendations,
	personalSourcesEmailSetupResponse,
} from "@carlnotes/contracts/personalSourcesAccounts"
import type { PersonalSourcesImportPayload } from "@carlnotes/contracts/personalSourcesPayloads"
import { apiClient, readApiResponse } from "./apiClient"

/**
 * Loads the sender's title/date page while they expand a Source.
 */
export async function fetchPersonalSourceTitles({
	topicId,
	sourceId,
	cursor,
	signal,
}: {
	topicId: string
	sourceId: string
	cursor?: string
	signal?: AbortSignal
}): Promise<PersonalSourceTitlePage> {
	const response = await apiClient().api.topics[":id"]["personal-sources"].sources[":sourceId"].titles.$get(
		{ param: { id: topicId, sourceId }, query: { cursor } },
		{ init: { signal } },
	)
	if (!response.ok) {
		throw new Error("Could not load Personal sources items.")
	}
	return readApiResponse(personalSourceTitlePage, response)
}

/**
 * Loads the sender's newest-first item page across their Personal sources on a Topic.
 */
export async function fetchTopicPersonalSourcesEntries({
	topicId,
	cursor,
	pageNumber,
	signal,
}: {
	topicId: string
	cursor?: string
	pageNumber?: number
	signal?: AbortSignal
}): Promise<PersonalSourceEntryPage> {
	const response = await apiClient().api.topics[":id"]["personal-sources"].entries.$get(
		{
			param: { id: topicId },
			query: { cursor, page: pageNumber === undefined ? undefined : String(pageNumber) },
		},
		{ init: { signal } },
	)
	return readApiResponse(personalSourceEntryPage, response)
}

/**
 * Loads app suggestions derived only from this sender's accepted sends.
 */
export async function fetchPersonalSourcesAiAgentRecommendations(topicId: string): Promise<{ aiAgentIds: string[] }> {
	const response = await apiClient().api.topics[":id"]["personal-sources"]["ai-agents"].recommendations.$get({
		param: { id: topicId },
	})
	if (!response.ok) {
		throw new Error("Could not load app suggestions.")
	}
	return readApiResponse(personalSourcesAiAgentRecommendations, response)
}

/**
 * Adds an authenticated connected AI Agent as an empty Source on an editable Topic.
 */
export async function sendAddPersonalSourcesAiAgent({
	topicId,
	clientId,
}: {
	topicId: string
	clientId: string
}): Promise<void> {
	const response = await apiClient().api.topics[":id"]["personal-sources"]["ai-agents"].$post({
		param: { id: topicId },
		json: { clientId },
	})
	if (!response.ok) {
		throw new Error("Reconnect the app and try again on a Topic you can edit.")
	}
}

/**
 * Loads manual forwarding guidance and availability for the sender.
 */
export async function fetchPersonalSourcesEmailSetup(
	topicId: string,
	signal?: AbortSignal,
): Promise<PersonalSourcesEmailSetupResponse> {
	const response = await apiClient().api.topics[":id"]["personal-sources"].email.$get(
		{ param: { id: topicId } },
		{ init: { signal } },
	)
	if (!response.ok) {
		throw new Error("Could not load email setup.")
	}
	return readApiResponse(personalSourcesEmailSetupResponse, response)
}

/**
 * Imports only the conversations explicitly confirmed in the web preview.
 */
export async function sendImportConversations({
	topicId,
	payload,
}: {
	topicId: string
	payload: PersonalSourcesImportPayload
}): Promise<PersonalSourcesImportResult> {
	const response = await apiClient().api.topics[":id"]["personal-sources"].imports.$post({
		param: { id: topicId },
		json: payload,
	})
	if (![200, 404, 409, 503].includes(response.status)) {
		throw new Error("Could not import the selected conversations.")
	}
	return readApiResponse(personalSourcesImportResult, response)
}

/**
 * Loads receiving Sources and private-context readiness alongside the legacy Topic response.
 */
export async function fetchTopicPersonalSources(topicId: string, signal?: AbortSignal): Promise<TopicPersonalSources> {
	const response = await apiClient().api.topics[":id"]["personal-sources"].$get(
		{ param: { id: topicId } },
		{ init: { signal } },
	)
	if (!response.ok) {
		throw new Error("Could not load the Topic personal sources.")
	}
	return readApiResponse(topicPersonalSources, response)
}

/**
 * Loads one bounded page of a receiving Source's live entries.
 */
export async function fetchPersonalSourcesEntries({
	topicId,
	sourceId,
	cursor,
	signal,
}: {
	topicId: string
	sourceId: string
	cursor?: string
	signal?: AbortSignal
}): Promise<PersonalSourceEntryPage> {
	const response = await apiClient().api.topics[":id"]["personal-sources"].sources[":sourceId"].entries.$get(
		{
			param: { id: topicId, sourceId },
			query: { cursor },
		},
		{ init: { signal } },
	)
	if (!response.ok) {
		throw new Error("Could not load Personal sources items.")
	}
	return readApiResponse(personalSourceEntryPage, response)
}

/**
 * Deletes one entry and invalidates the Topic's derived private context.
 */
export async function sendDeletePersonalSourceEntry({
	topicId,
	entryId,
}: {
	topicId: string
	entryId: string
}): Promise<void> {
	const response = await apiClient().api.topics[":id"]["personal-sources"].entries[":entryId"].$delete({
		param: { id: topicId, entryId },
	})
	if (!response.ok) {
		throw new Error("Could not delete the Personal sources item.")
	}
}

/**
 * Explicitly removes a receiving Source and its entries while preserving Topic sharing settings.
 */
export async function sendDeletePersonalSource({
	topicId,
	sourceId,
}: {
	topicId: string
	sourceId: string
}): Promise<void> {
	const response = await apiClient().api.topics[":id"]["personal-sources"].sources[":sourceId"].$delete({
		param: { id: topicId, sourceId },
	})
	if (!response.ok) {
		throw new Error("Could not remove the Personal source.")
	}
}
