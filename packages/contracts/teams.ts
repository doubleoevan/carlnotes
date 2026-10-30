// the team contracts: a team's identity, the teams page rows, the team page, and the responses its write routes return
import { z } from "zod"
import { chatMention } from "./chat"
import { avatarSources, teamRoles } from "./enums"
import { profileIdentity, topic } from "./profiles"
import { displayEnum } from "./tolerantReads"

// how a Team is shown with its name, avatar and id to link
export const teamIdentity = z.object({
	teamId: z.string(),
	name: z.string(),
	// the version of its own uploaded image, or null for the initials and tint drawn from its name and id
	avatarVersion: z.string().nullable(),
})

export type TeamIdentity = z.infer<typeof teamIdentity>

// the fields every teams page row shows, shared by memberships and received invitations
export const teamRowFields = teamIdentity.extend({
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
	// who invited the user onto the team, for the summary's Invited by column. null joined on their own
	invitedBy: profileIdentity.nullable(),
	// the user's unseen mentions in the team's own chat room, latest first, counted on the name's badge
	chatMentions: z.array(chatMention),
})

export type TeamSummary = z.infer<typeof teamSummary>

// one member of a team page
export const teamMember = z.object({
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
})

export type TeamPageResponse = z.infer<typeof teamPageResponse>

// the gate a private team shows a non-member: its name, and whether the user has already asked to join
export const teamGateResponse = z.object({ teamName: z.string(), hasRequestedToJoin: z.boolean() })

export type TeamGateResponse = z.infer<typeof teamGateResponse>

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
