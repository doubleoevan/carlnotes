// the Activity page's owned topics, subscriptions, and sent topic invites for stories on both apps
import type { OwnerTopic, SubscriptionRow } from "./activity"
import type { InviteRow } from "./invites"
import { toTestProfileIdentity } from "./teamTestFixtures"

// the people who own the followed topics and whom the invites reached
const CARLOS = toTestProfileIdentity("carlos")
const EVAN = toTestProfileIdentity("evan")

// a team topic followed with emails on, a follow switched off, and a topic invite the user has not answered
export const TEST_SUBSCRIPTIONS: SubscriptionRow[] = [
	{
		topicId: "topic-design-systems",
		name: "Design systems",
		owner: CARLOS,
		team: { teamId: "team-design-guild", name: "Design Guild", avatarVersion: null },
		visibility: "invite",
		subscribedAt: "2026-08-14T12:00:00.000Z",
		isActive: true,
		isEmailEnabled: true,
		inviteId: null,
		latestPodcastEpisode: null,
	},
	{
		topicId: "topic-robot-vacuums",
		name: "Robot vacuums",
		owner: EVAN,
		team: null,
		visibility: "public",
		subscribedAt: "2026-06-01T12:00:00.000Z",
		isActive: false,
		isEmailEnabled: false,
		inviteId: null,
		latestPodcastEpisode: null,
	},
	{
		topicId: "topic-home-espresso",
		name: "Home espresso",
		owner: EVAN,
		team: null,
		visibility: "invite",
		subscribedAt: "2026-10-20T12:00:00.000Z",
		isActive: false,
		isEmailEnabled: false,
		inviteId: "invite-home-espresso",
		latestPodcastEpisode: null,
	},
]

// an invite Carlos accepted, one Evan has not answered, and one to an address with no account yet
export const TEST_TOPIC_INVITES: InviteRow[] = [
	{
		topicId: "topic-llm-tooling",
		name: "LLM tooling",
		inviteId: "invite-carlos",
		inviteeEmail: "carlos@example.com",
		invitee: CARLOS,
		invitedAt: "2026-09-02T12:00:00.000Z",
		subscribedAt: "2026-09-03T12:00:00.000Z",
	},
	{
		topicId: "topic-llm-tooling",
		name: "LLM tooling",
		inviteId: "invite-evan",
		inviteeEmail: null,
		invitee: EVAN,
		invitedAt: "2026-09-20T12:00:00.000Z",
		subscribedAt: null,
	},
	{
		topicId: "topic-climbing-gyms",
		name: "Climbing gyms",
		inviteId: "invite-pat",
		inviteeEmail: "pat@example.com",
		invitee: null,
		invitedAt: "2026-10-01T12:00:00.000Z",
		subscribedAt: null,
	},
]

// a daily topic with two scans this month, and a weekly invite topic with emails off and no scans yet
export const TEST_OWNER_TOPICS: OwnerTopic[] = [
	{
		id: "topic-llm-tooling",
		name: "LLM tooling",
		visibility: "public",
		frequency: "daily",
		monthScanCount: 2,
		subscriberCount: 14,
		createdAt: "2026-06-02T12:00:00.000Z",
		updatedAt: "2026-10-30T12:00:00.000Z",
		monthCostCents: 86,
		monthEmailCount: 9,
		ownerUserId: "user-vienna",
		isEmailEnabled: true,
		scans: [
			{
				id: "scan-llm-tooling-2",
				status: "succeeded",
				error: null,
				startedAt: "2026-10-30T12:00:00.000Z",
				finishedAt: "2026-10-30T12:04:00.000Z",
				stoppedAt: null,
				foundCount: 42,
				keptCount: 6,
				costCents: 44,
			},
			{
				id: "scan-llm-tooling-1",
				status: "failed",
				error: "The model budget ran out.",
				startedAt: "2026-10-29T12:00:00.000Z",
				finishedAt: "2026-10-29T12:01:00.000Z",
				stoppedAt: null,
				foundCount: 12,
				keptCount: 0,
				costCents: 42,
			},
		],
		chatMentions: [],
		latestPodcastEpisode: null,
	},
	{
		id: "topic-design-systems",
		name: "Design systems",
		visibility: "invite",
		frequency: "weekly",
		monthScanCount: 0,
		subscriberCount: 3,
		createdAt: "2026-05-18T12:00:00.000Z",
		updatedAt: "2026-10-01T12:00:00.000Z",
		monthCostCents: 0,
		monthEmailCount: 0,
		ownerUserId: "user-vienna",
		isEmailEnabled: false,
		scans: [],
		chatMentions: [],
		latestPodcastEpisode: null,
	},
]
