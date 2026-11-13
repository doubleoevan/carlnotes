import type { ProfileResponse } from "./profilePage"
import { TEST_TEAM_SUMMARIES, toTestTableTopic } from "./teamTestFixtures"

/**
 * Returns a test profile another person reads: two public topics, two teams, and no cards.
 */
export function toTestProfile(overrides: Partial<ProfileResponse> = {}): ProfileResponse {
	return {
		userId: "user-carl",
		username: "carl",
		avatarSource: "generated",
		avatarVersion: null,
		joinedAt: "2026-06-01T00:00:00.000Z",
		subscriberCount: 12,
		includesNonPublicTopics: false,
		isBlocked: false,
		topics: [toTestTableTopic(), toTestTableTopic({ id: "topic-2", name: "Espresso extraction", keptCount: 9 })],
		teams: TEST_TEAM_SUMMARIES,
		profileTopics: [],
		pinnedTopicCount: 0,
		profileTopicPodcastEpisodeVideos: [],
		pinnedTopicPodcastEpisodeVideoCount: 0,
		profilePodcastEpisodes: [],
		pinnedPodcastEpisodeCount: 0,
		profileTopicPosts: [],
		pinnedTopicPostCount: 0,
		...overrides,
	}
}
