// the team contracts: a team's identity, the teams page rows, and the team page

import type { ChatMention } from "./chat"
import type { avatarSources, teamRoles } from "./enums"
import type { ProfileIdentity, Topic } from "./profiles"

// the fields every teams page row shows, shared by memberships and received invitations
export type TeamRowFields = TeamIdentity & {
	isPublic: boolean
	// the description, which the table truncates into its own column
	description: string | null
	// the active members and held topics, whose counts open the row's subtables
	memberCount: number
	topicCount: number
	// this month's spend in cents across the team's topics, split by what produced it
	scanSpendCents: number
	chatSpendCents: number
}

// one row of the teams summary: a team the user belongs to and their role
export type TeamSummary = TeamRowFields & {
	role: (typeof teamRoles)[number]
	// whether the user is the team's only active leader, whose leave toggle points at the members instead
	isOnlyLeader: boolean
	// who invited the user onto the team, for the summary's Invited by column. null joined on their own
	invitedBy: ProfileIdentity | null
	// the user's unseen mentions in the team's own chat room, latest first, counted on the name's badge
	chatMentions: ChatMention[]
}

// the team page payload
export type TeamPageResponse = {
	teamId: string
	name: string
	description: string | null
	isPublic: boolean
	// the version of its own uploaded image, or null for the initials and tint drawn from its name and id
	avatarVersion: string | null
	// what the user is to this team, which decides the leader controls and the full team
	role: (typeof teamRoles)[number] | null
	// whether the user has asked to join, which flips the join button to a withdraw
	hasRequestedToJoin: boolean
	members: {
		userId: string
		username: string
		avatarSource: (typeof avatarSources)[number] | null
		avatarVersion: string | null
		role: (typeof teamRoles)[number]
		isMemberVisible: boolean
		// false is a request to join, shown to team leaders who can activate a new member
		isActive: boolean
	}[]
	// how many members opted out of the public members list, so the team never appears smaller than it is
	hiddenMemberCount: number
	// the user's unseen chat mentions in the team's chat room, latest first, for the title badge and the pill
	chatMentions: ChatMention[]
	// the same profile-shaped rows the profile page's topic table renders
	topics: Topic[]
}

// the teams index: memberships and both directions of invitations
export type TeamsPageResponse = {
	teams: TeamSummary[]
	// the team invitations waiting for an answer, each naming its sender. the page links only where it opens
	receivedInvites: (TeamRowFields & {
		inviteId: string
		sender: ProfileIdentity | null
		invitedAt: string
	})[]
	// the invitations the user sent, each naming who it reached and whether they joined
	sentInvites: (TeamIdentity & {
		inviteId: string
		// the email address it was sent to, or the account for a username invite
		inviteeEmail: string | null
		invitee: ProfileIdentity | null
		invitedAt: string
		joinedAt: string | null
	})[]
}

// how a Team is shown with its name, avatar and id to link
export type TeamIdentity = {
	teamId: string
	name: string
	// the version of its own uploaded image, or null for the initials and tint drawn from its name and id
	avatarVersion: string | null
}
