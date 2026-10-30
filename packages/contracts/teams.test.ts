// the team response contracts, each parsing the body its route sends
import { describe, expect, test } from "bun:test"
import {
	type TeamPageResponse,
	type TeamsPageResponse,
	teamCreateResponse,
	teamDeleteResponse,
	teamGateResponse,
	teamNameTakenResponse,
	teamPageResponse,
	teamsPageResponse,
} from "./teams"

// the Design Guild's leader, as a profile identity and a member row
const LEADER = { userId: "user-ava", username: "ava", avatarSource: null, avatarVersion: null }

// a team page with a leader, a pending join request, one topic with a podcast episode, and one chat mention
const TEAM_PAGE: TeamPageResponse = {
	teamId: "team-design-guild",
	name: "Design Guild",
	avatarVersion: "3",
	description: "Designers and engineers who keep up with the tooling they build with.",
	isPublic: false,
	role: "leader",
	hasRequestedToJoin: false,
	members: [
		{ ...LEADER, role: "leader", isMemberVisible: true, isActive: true },
		{
			userId: "user-ben",
			username: "ben",
			avatarSource: "upload",
			avatarVersion: "1",
			role: "member",
			isMemberVisible: false,
			isActive: false,
		},
	],
	hiddenMemberCount: 1,
	chatMentions: [
		{ teamId: "team-design-guild", chatMessageId: 12, authorUsername: "ben", isReply: true, excerpt: "@ava saw this?" },
	],
	topics: [
		{
			id: "topic-home-espresso",
			name: "Home espresso",
			visibility: "public",
			createdAt: "2026-05-01T12:00:00.000Z",
			updatedAt: "2026-09-28T12:00:00.000Z",
			keptCount: 14,
			seenCount: 220,
			subscriberCount: 31,
			isEmailEnabled: true,
			latestPodcastEpisode: {
				id: "episode-1",
				title: "Burrs, measured",
				description: "Why aligned burrs fix uneven shots.",
				season: 2026,
				episodeNumber: 4,
				durationSeconds: 612,
				publishedAt: "2026-09-29T08:00:00.000Z",
				pagePath: "/topics/topic-home-espresso/home-espresso/episodes/4",
				chapterCount: 2,
			},
		},
	],
}

describe("teamPageResponse", () => {
	test("parses a team page", () => {
		expect(teamPageResponse.parse(TEAM_PAGE)).toEqual(TEAM_PAGE)
	})

	test("rejects a member with a role the build does not know", () => {
		const members = [{ ...TEAM_PAGE.members[0], role: "owner" }]
		expect(teamPageResponse.safeParse({ ...TEAM_PAGE, members }).success).toBe(false)
	})
})

describe("teamsPageResponse", () => {
	test("parses memberships and both directions of invitations", () => {
		// a membership row, a received invitation, and a sent one that was accepted
		const rowFields = {
			teamId: "team-design-guild",
			name: "Design Guild",
			avatarVersion: null,
			isPublic: true,
			description: null,
			memberCount: 2,
			topicCount: 1,
			scanSpendCents: 120,
			chatSpendCents: 35,
		}
		const teamsPage: TeamsPageResponse = {
			teams: [{ ...rowFields, role: "member", isOnlyLeader: false, invitedBy: LEADER, chatMentions: [] }],
			receivedInvites: [{ ...rowFields, inviteId: "invite-1", sender: LEADER, invitedAt: "2026-09-01T12:00:00.000Z" }],
			sentInvites: [
				{
					teamId: "team-design-guild",
					name: "Design Guild",
					avatarVersion: null,
					inviteId: "invite-2",
					inviteeEmail: "ben@example.com",
					invitee: null,
					invitedAt: "2026-09-02T12:00:00.000Z",
					joinedAt: "2026-09-03T12:00:00.000Z",
				},
			],
		}
		expect(teamsPageResponse.parse(teamsPage)).toEqual(teamsPage)
	})
})

describe("the small team responses", () => {
	test("parse the gate, the name check, the create, and both delete outcomes", () => {
		expect(teamGateResponse.parse({ teamName: "Design Guild", hasRequestedToJoin: true })).toEqual({
			teamName: "Design Guild",
			hasRequestedToJoin: true,
		})
		expect(teamNameTakenResponse.parse({ isTaken: false })).toEqual({ isTaken: false })
		expect(teamCreateResponse.parse({ teamId: "team-1" })).toEqual({ teamId: "team-1" })
		expect(teamDeleteResponse.parse({ status: "deleted" })).toEqual({ status: "deleted" })
		expect(teamDeleteResponse.parse({ status: "handedOver", newLeaderUsername: "ben" })).toEqual({
			status: "handedOver",
			newLeaderUsername: "ben",
		})
	})

	test("the gate without the team's name is not a gate", () => {
		expect(teamGateResponse.safeParse({ error: "not found" }).success).toBe(false)
	})
})
