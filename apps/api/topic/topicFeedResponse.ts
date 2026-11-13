// the topic feed response: the feed's sections with the user's topic quotas merged in. a signed-out visitor reads the
// shared visitor feed and has no quota
import type { TopicFeedResponse } from "@carlnotes/contracts/topics"
import { traceRequestStage } from "@carlnotes/server/monitoring"
import { loadDailyTopicQuota, topicLimit, topicsRemaining } from "../authorization"
import { buildTopicFeeds, readVisitorTopicFeeds } from "./feeds"

/**
 * Loads the topic feed response: the user's sections, or a visitor's home and popular, with how many topics the user may
 * still create, their plan's topic limit, and their daily topic slots. A visitor's quotas are zero.
 */
export async function loadTopicFeedResponse(
	userId: string | null,
	isConsumedIncluded: boolean,
): Promise<TopicFeedResponse> {
	// the sections and the quotas, read at once. every visitor shares one feed
	const [topicFeeds, remainingNewTopics, ownedTopicLimit, dailyTopicQuota] = await Promise.all([
		traceRequestStage("topic_feed.build", () =>
			userId ? buildTopicFeeds(userId, isConsumedIncluded) : readVisitorTopicFeeds(isConsumedIncluded),
		),
		userId ? topicsRemaining(userId) : Promise.resolve(0),
		userId ? topicLimit(userId) : Promise.resolve(0),
		userId ? loadDailyTopicQuota(userId) : Promise.resolve({ limit: 0, remainingTopics: 0 }),
	])
	return {
		...topicFeeds,
		topicsRemaining: remainingNewTopics,
		topicLimit: ownedTopicLimit,
		dailyTopicLimit: dailyTopicQuota.limit,
		dailyTopicsRemaining: dailyTopicQuota.remainingTopics,
	}
}
