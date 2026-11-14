// the team contracts: the teams page rows, the team page, and the responses its write routes return
import { z } from "zod"
import { chatMention } from "./chat"
import { avatarSources, teamRoles } from "./enums"
import { podcastEpisodeCard, topicCard } from "./home"
import { profileIdentity, topic } from "./profiles"
import { teamIdentity } from "./teamIdentity"
import { displayEnum } from "./tolerantReads"
import { topicPostCard } from "./topicPosts"

// the fields every teams page row shows, shared by memberships and received invitations
const teamRowFields = teamIdentity.extend({
	isPublic: z.boolean(),
	// the description, which the table truncates into its own column
	description: z.string().nullable(),
	// the active members and held topics, whose counts open the row's subtables
	memberCount: z.number(),
	topicCount: z.number(),
	// this month's spend in cents across the team's topics, split by what produced it
	scanSpendCents: z.number(),
	chatSpendCents: z.number(),
})

export type TeamRowFields = z.infer<typeof teamRowFields>

// one row of the teams summary: a team the user belongs to and their role
export const teamSummary = teamRowFields.extend({
	role: z.enum(teamRoles),
	// whether the user is the team's only active leader, whose leave toggle points at the members instead
	isOnlyLeader: z.boolean(),
	// whether this is the user's default team, the led team they joined first, which a public or invite topic goes
	// on. absent on a team the user does not lead
	isDefaultTeam: z.boolean().optional(),
	// who invited the user onto the team, for the summary's Invited by column. null joined on their own
	invitedBy: profileIdentity.nullable(),
	// the user's unseen mentions in the team's own chat room, latest first, counted on the name's badge
	chatMentions: z.array(chatMention),
})

export type TeamSummary = z.infer<typeof teamSummary>

// one member of a team page
const teamMember = z.object({
	userId: z.string(),
	username: z.string(),
	avatarSource: displayEnum(avatarSources).nullable(),
	avatarVersion: z.string().nullable(),
	role: z.enum(teamRoles),
	isMemberVisible: z.boolean(),
	// false is a request to join, shown to team leaders who can activate a new member
	isActive: z.boolean(),
})

export type TeamMember = z.infer<typeof teamMember>

// the team page payload
export const teamPageResponse = teamIdentity.extend({
	description: z.string().nullable(),
	isPublic: z.boolean(),
	// the version of the avatar this leader uploaded, shown to them alone until its image moderation can run. absent
	// with none unchecked, and from an api older than the field. avatarVersion stays the avatar everyone else sees
	uncheckedAvatarVersion: z.string().optional(),
	// what the user is to this team, which decides the leader controls and the full team
	role: z.enum(teamRoles).nullable(),
	// whether the user has asked to join, which flips the join button to a withdraw
	hasRequestedToJoin: z.boolean(),
	members: z.array(teamMember),
	// how many members opted out of the public members list, so the team never appears smaller than it is
	hiddenMemberCount: z.number(),
	// the user's unseen chat mentions in the team's chat room, latest first, for the title badge and the pill
	chatMentions: z.array(chatMention),
	// the same profile-shaped rows the profile page's topic table renders
	topics: z.array(topic),
	// those topics as cards: the ones their owners pinned on their profiles first, then the rest in the home's
	// trending order
	topicCards: z.array(topicCard),
	// the published podcast episodes of those topics that have a ready film, as film cards: the films their topics'
	// owners pinned on their profiles first, then the most listened one of each other topic. optional, so a released
	// app reads a payload without them
	topicPodcastEpisodeVideoCards: z.array(podcastEpisodeCard).optional(),
	// the published podcast episodes of those topics as cards: the pinned ones first, then the most listened one of
	// each other topic
	podcastEpisodeCards: z.array(podcastEpisodeCard),
	// every published Topic Post of those topics as cards: the ones their authors pinned on their profiles first in
	// their order, then the rest newest first
	topicPostCards: z.array(topicPostCard),
})

export type TeamPageResponse = z.infer<typeof teamPageResponse>

// the gate a private team shows a non-member: its name, and whether the user has already asked to join
export const teamGateResponse = z.object({ teamName: z.string(), hasRequestedToJoin: z.boolean() })

// the teams index: memberships and both directions of invitations
export const teamsPageResponse = z.object({
	teams: z.array(teamSummary),
	// the team invitations waiting for an answer, each naming its sender. the page links only where it opens
	receivedInvites: z.array(
		teamRowFields.extend({
			inviteId: z.string(),
			sender: profileIdentity.nullable(),
			invitedAt: z.string(),
		}),
	),
	// the invitations the user sent, each naming who it reached and whether they joined
	sentInvites: z.array(
		teamIdentity.extend({
			inviteId: z.string(),
			// the email address it was sent to, or the account for a username invite
			inviteeEmail: z.string().nullable(),
			invitee: profileIdentity.nullable(),
			invitedAt: z.string(),
			joinedAt: z.string().nullable(),
		}),
	),
})

export type TeamsPageResponse = z.infer<typeof teamsPageResponse>

// what the name check returns: whether another team already has the name
export const teamNameTakenResponse = z.object({ isTaken: z.boolean() })

// what creating a team returns: the id that names the new page and where an avatar upload goes
export const teamCreateResponse = z.object({ teamId: z.string() })

// what deleting a team returns: the team is gone, or it survived under a new leader while the caller left
export const teamDeleteResponse = z.discriminatedUnion("status", [
	z.object({ status: z.literal("deleted") }),
	z.object({ status: z.literal("handedOver"), newLeaderUsername: z.string() }),
])

export type TeamDeleteResponse = z.infer<typeof teamDeleteResponse>

/**
 * Returns a team page's title: the team's name, then Franchise.
 */
export function toTeamPageTitle(teamName: string): string {
	return `${teamName} Franchise`
}

/**
 * Returns teams in alphabetical order by name, ignoring case and accents.
 */
export function toAlphabeticalTeams<Team extends { name: string }>(teams: Team[]): Team[] {
	return [...teams].sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: "base" }))
}
