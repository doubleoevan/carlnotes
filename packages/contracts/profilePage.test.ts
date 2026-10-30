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
}

// the payload parses unchanged, topics and teams included
test("the profile response parses the topics and the teams", () => {
	expect(profileResponse.parse(profileFixture)).toEqual(profileFixture)
})
