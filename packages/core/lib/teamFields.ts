import type { TeamIdentity } from "@carlnotes/contracts/teams"

// both editors stage invitations until the team is saved
export type PendingInvite = { email: string } | { username: string }
export type TopicOption = { id: string; name: string }
export type EditedTeam = Pick<TeamIdentity, "teamId" | "name" | "avatarVersion"> & {
	description: string | null
	isPublic: boolean
}
