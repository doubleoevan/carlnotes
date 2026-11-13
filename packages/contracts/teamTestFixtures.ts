import type { ProfileIdentity, Topic } from "./profiles"
import type { TeamPageResponse, TeamSummary, TeamsPageResponse } from "./teams"

/**
 * Returns a test topic as a profile's or a team's topics table lists it, public with a few kept findings.
 */
export function toTestTableTopic(overrides: Partial<Topic> = {}): Topic {
	return {
		id: "topic-1",
		name: "Pour-over coffee",
		visibility: "public",
		createdAt: "2026-07-01T00:00:00.000Z",
		updatedAt: "2026-10-02T00:00:00.000Z",
		keptCount: 18,
		seenCount: 64,
		subscriberCount: 5,
		isEmailEnabled: null,
		latestPodcastEpisode: null,
		...overrides,
	}
}

/**
 * Returns a test team page a member reads: a leader and two members, two topics, a description, and no cards.
 */
export function toTestTeamPage(overrides: Partial<TeamPageResponse> = {}): TeamPageResponse {
	// the leader and the members
	const toMember = ({
		username,
		role,
	}: {
		username: string
		role: "leader" | "member"
	}): TeamPageResponse["members"][number] => ({
		...toTestProfileIdentity(username),
		avatarSource: "generated" as const,
		role,
		isMemberVisible: true,
		isActive: true,
	})
	return {
		teamId: "team-coffee-lab",
		name: "Coffee Lab",
		description: "Roasters and baristas comparing notes on brewing, beans, and gear.",
		isPublic: true,
		role: "member",
		avatarVersion: null,
		hasRequestedToJoin: false,
		hiddenMemberCount: 0,
		chatMentions: [],
		members: [
			toMember({ username: "carl", role: "leader" }),
			toMember({ username: "vienna", role: "member" }),
			toMember({ username: "mira", role: "member" }),
		],
		topics: [
			toTestTableTopic(),
			toTestTableTopic({ id: "topic-2", name: "Espresso extraction", visibility: "invite", keptCount: 9 }),
		],
		topicCards: [],
		podcastEpisodeCards: [],
		topicPostCards: [],
		...overrides,
	}
}

/**
 * Returns a test person's identity, with an id from the username and no avatar.
 */
export function toTestProfileIdentity(username: string): ProfileIdentity {
	return { userId: `user-${username}`, username, avatarSource: null, avatarVersion: null }
}

// the people who lead and invite on the test teams
const CARL = toTestProfileIdentity("carl")
const MIRA = toTestProfileIdentity("mira")

// a team the user leads alone and a team Carl invited them onto
export const TEST_TEAM_SUMMARIES: TeamSummary[] = [
	{
		teamId: "team-coffee-lab",
		name: "Coffee Lab",
		avatarVersion: null,
		description: "Roasters and baristas comparing notes on brewing, beans, and gear.",
		isPublic: true,
		memberCount: 3,
		topicCount: 2,
		scanSpendCents: 412,
		chatSpendCents: 96,
		role: "leader",
		isOnlyLeader: true,
		invitedBy: null,
		chatMentions: [],
	},
	{
		teamId: "team-reading-circle",
		name: "Reading Circle",
		avatarVersion: null,
		description: null,
		isPublic: false,
		memberCount: 5,
		topicCount: 3,
		scanSpendCents: 1290,
		chatSpendCents: 310,
		role: "member",
		isOnlyLeader: false,
		invitedBy: CARL,
		chatMentions: [],
	},
]

// Mira's invite to a public team the user has not answered
export const TEST_RECEIVED_INVITES: TeamsPageResponse["receivedInvites"] = [
	{
		teamId: "team-espresso-club",
		name: "Espresso Club",
		avatarVersion: null,
		description: "Home espresso setups, dialed in together.",
		isPublic: true,
		memberCount: 2,
		topicCount: 1,
		scanSpendCents: 150,
		chatSpendCents: 20,
		inviteId: "invite-espresso-club",
		sender: MIRA,
		invitedAt: "2026-10-20T12:00:00.000Z",
	},
]
