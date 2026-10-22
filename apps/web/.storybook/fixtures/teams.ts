// the invented teams the stories show: each team's identity, and builders for a team member, a team page, and a
// teams table row
import type { ProfileIdentity, Topic } from "@carlnotes/contracts/profiles"
import type { TeamPageResponse, TeamRowFields } from "@carlnotes/contracts/teams"
import { toStoryProfile } from "../fixtures"

/** One member of a team page, as the team page payload sends them. */
export type StoryTeamMember = TeamPageResponse["members"][number]

// a team page's own fields, its members and topics, and the role the user holds on it
type ToStoryTeamPageOptions = Pick<TeamPageResponse, "teamId" | "name" | "description" | "isPublic" | "role"> & {
	members: StoryTeamMember[]
	topics: Topic[]
}

/** The invented teams the stories name, each with no uploaded avatar. */
export const STORY_TEAMS = {
	designGuild: {
		teamId: "team-design-guild",
		name: "Design Guild",
		avatarVersion: null,
		description: "Designers and engineers who keep up with the tooling they build with.",
	},
	readingGroup: {
		teamId: "team-reading-group",
		name: "Reading Group",
		avatarVersion: null,
		description: "Papers and posts on LLM tooling, read together every week.",
	},
	modelWatchers: {
		teamId: "team-model-watchers",
		name: "Model Watchers",
		avatarVersion: null,
		description: "A weekly read on LLM tooling, evaluation harnesses, and the open models worth trying at work.",
	},
	batteryReaders: {
		teamId: "team-battery-readers",
		name: "Battery Readers",
		avatarVersion: null,
		description: "Solid-state cells, sodium-ion chemistry, and the grid storage findings that follow them.",
	},
} satisfies Record<string, Pick<TeamRowFields, "teamId" | "name" | "avatarVersion" | "description">>

/**
 * Returns an active team member drawn with initials, who shows on the public members list, with the fields a story
 * changes.
 */
export function toStoryTeamMember(
	storyPerson: Pick<ProfileIdentity, "userId" | "username">,
	memberFields: Partial<StoryTeamMember> = {},
): StoryTeamMember {
	return {
		...toStoryProfile(storyPerson),
		role: "member",
		isMemberVisible: true,
		isActive: true,
		...memberFields,
	}
}

/**
 * Returns the team page a row's subtables load, with no uploaded avatar and no chat mentions.
 */
export function toStoryTeamPage(teamPageFields: ToStoryTeamPageOptions): TeamPageResponse {
	return { ...teamPageFields, avatarVersion: null, hasRequestedToJoin: false, hiddenMemberCount: 0, chatMentions: [] }
}

/**
 * Returns the fields a teams table row shows, counted from the row's team page, with the month's spend.
 */
export function toStoryTeamRowFields(
	teamPage: TeamPageResponse,
	{ scanSpendCents, chatSpendCents }: Pick<TeamRowFields, "scanSpendCents" | "chatSpendCents">,
): TeamRowFields {
	return {
		teamId: teamPage.teamId,
		name: teamPage.name,
		avatarVersion: teamPage.avatarVersion,
		isPublic: teamPage.isPublic,
		description: teamPage.description,
		memberCount: teamPage.members.length,
		topicCount: teamPage.topics.length,
		scanSpendCents,
		chatSpendCents,
	}
}
