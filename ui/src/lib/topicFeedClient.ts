// the typed topic feed Hono RPC client. the api's AppType is imported as types-only, so no api code ends up in the ui bundle
import { type TopicFeedResponse, topicFeedResponse } from "@shared/contracts"
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
