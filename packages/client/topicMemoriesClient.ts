// reads a Journal page and saves feedback through the Topic's authorized API
import {
	type TopicMemoriesPage,
	type TopicMemoryFeedback,
	type TopicMemoryFeedbackResult,
	topicMemoriesPage,
	topicMemoryFeedbackResult,
} from "@carlnotes/contracts/topicMemories"
import { apiClient, readApiResponse } from "./apiClient"

/** Reads one page of takeaways. */
export async function fetchTopicMemories({
	topicId,
	page,
	signal,
}: {
	topicId: string
	page: number
	signal: AbortSignal
}): Promise<TopicMemoriesPage> {
	const response = await apiClient().api.topics[":id"].journal.$get(
		{ param: { id: topicId }, query: { page: String(page) } },
		{ init: { signal } },
	)
	return readApiResponse(topicMemoriesPage, response)
}

/** Saves the caller's vote and optional correction. */
export async function rateTopicMemory({
	topicId,
	topicMemoryId,
	feedback,
}: {
	topicId: string
	topicMemoryId: string
	feedback: TopicMemoryFeedback
}): Promise<TopicMemoryFeedbackResult> {
	const response = await apiClient().api.topics[":id"].journal[":memoryId"].feedback.$put({
		param: { id: topicId, memoryId: topicMemoryId },
		json: feedback,
	})
	return readApiResponse(topicMemoryFeedbackResult, response)
}
