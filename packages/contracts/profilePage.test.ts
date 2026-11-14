// profile page contract tests: the profile payload parses as the api writes it
import { expect, test } from "bun:test"
import { type ProfileResponse, profileResponse } from "./profilePage"

// a profile with one public topic and one team the user belongs to
const profileFixture: ProfileResponse = {
	userId: "user-2",
	username: "lin",
	avatarSource: "generated",
	avatarVersion: null,
	joinedAt: "2026-07-01T00:00:00.000Z",
	subscriberCount: 4,
	includesNonPublicTopics: false,
	isBlocked: false,
	topics: [
		{
			id: "topic-1",
			name: "Rust in production",
			visibility: "public",
			createdAt: "2026-09-01T00:00:00.000Z",
			updatedAt: "2026-10-01T00:00:00.000Z",
			keptCount: 40,
			seenCount: 300,
			subscriberCount: 4,
			isEmailEnabled: null,
			latestPodcastEpisode: null,
		},
	],
	teams: [
		{
			teamId: "team-1",
			name: "Baristas",
			avatarVersion: "2",
			isPublic: true,
			description: "Espresso and its machines",
			memberCount: 3,
			topicCount: 2,
			scanSpendCents: 200,
			chatSpendCents: 50,
			role: "member",
			isOnlyLeader: false,
			invitedBy: { userId: "user-1", username: "evan", avatarSource: "generated", avatarVersion: null },
			chatMentions: [],
		},
	],
	// the one public topic as a pinned card, and no film and no podcast episode
	profileTopics: [
		{
			id: "topic-1",
			name: "Rust in production",
			path: "/topics/topic-1/rust-in-production",
			image: null,
			tags: ["rust"],
			owner: null,
			teamLink: null,
			reactionCount: 2,
			latestPodcastEpisode: null,
			isPublic: true,
			isOwned: true,
		},
	],
	pinnedTopicCount: 1,
	profileTopicPodcastEpisodeVideos: [],
	pinnedTopicPodcastEpisodeVideoCount: 0,
	profilePodcastEpisodes: [],
	pinnedPodcastEpisodeCount: 0,
	profileTopicPosts: [],
	pinnedTopicPostCount: 0,
}

// the payload parses unchanged, topics, teams, and cards included
test("the profile response parses the topics, the teams, and the cards", () => {
	expect(profileResponse.parse(profileFixture)).toEqual(profileFixture)
})

// a card with no word on whether its topic is public is rejected
test("a profile topic card must say whether its topic is public", () => {
	const [profileTopic] = profileFixture.profileTopics
	const { isPublic: _isPublic, ...cardWithoutVisibility } = profileTopic ?? { isPublic: true }
	const parseResult = profileResponse.safeParse({ ...profileFixture, profileTopics: [cardWithoutVisibility] })
	expect(parseResult.success).toBe(false)
})
