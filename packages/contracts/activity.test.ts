// activity contract tests: the activity payload parses as the api writes it
import { expect, test } from "bun:test"
import { type ActivityResponse, activityResponse } from "./activity"

// a user with one owned topic, one subscription on a team's topic, and one sent invite
const activityFixture: ActivityResponse = {
	user: { userId: "user-1", username: "evan", avatarSource: "generated", avatarVersion: null },
	scanSpendCents: 120,
	chatSpendCents: 30,
	podcastEpisodeSpendCents: 0,
	budgetCents: 1000,
	monthlyBudgetCutoffs: [{ kind: "spokenQuestions", budgetShare: 0.5 }],
	topics: [
		{
			id: "topic-1",
			name: "Rust in production",
			visibility: "public",
			frequency: "daily",
			monthScanCount: 3,
			subscriberCount: 2,
			createdAt: "2026-09-01T00:00:00.000Z",
			updatedAt: "2026-10-01T00:00:00.000Z",
			monthCostCents: 120,
			monthEmailCount: 2,
			ownerUserId: "user-1",
			isEmailEnabled: true,
			scans: [
				{
					id: "scan-1",
					status: "failed",
					error: "the source timed out",
					startedAt: "2026-10-01T06:00:00.000Z",
					finishedAt: "2026-10-01T06:01:00.000Z",
					stoppedAt: null,
					foundCount: 12,
					keptCount: 0,
					costCents: 40,
				},
			],
			chatMentions: [
				{ teamId: "team-1", chatMessageId: 7, authorUsername: "carlos", isReply: false, excerpt: "Did you see this?" },
			],
			latestPodcastEpisode: null,
		},
	],
	subscriptions: [
		{
			topicId: "topic-2",
			name: "Espresso machines",
			owner: { userId: "user-2", username: "carlos", avatarSource: "oauth", avatarVersion: "3" },
			team: { teamId: "team-1", name: "Baristas", avatarVersion: null },
			visibility: "invite",
			subscribedAt: "2026-09-15T00:00:00.000Z",
			isActive: true,
			isEmailEnabled: false,
			inviteId: null,
			latestPodcastEpisode: {
				id: "episode-1",
				title: "Grinders",
				description: null,
				season: 2026,
				episodeNumber: 4,
				durationSeconds: 600,
				publishedAt: "2026-10-02T00:00:00.000Z",
				pagePath: "/podcast/2026/4",
				chapterCount: 3,
			},
		},
	],
	invites: [
		{
			inviteId: "invite-1",
			topicId: "topic-1",
			name: "Rust in production",
			inviteeEmail: "lin@example.com",
			invitee: null,
			invitedAt: "2026-10-03T00:00:00.000Z",
			subscribedAt: null,
		},
	],
}

// the payload parses unchanged, nested rows included
test("the activity response parses the owned topics, subscriptions, and invites", () => {
	expect(activityResponse.parse(activityFixture)).toEqual(activityFixture)
})
