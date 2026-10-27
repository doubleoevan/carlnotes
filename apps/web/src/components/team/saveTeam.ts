import { sendTeamAvatar } from "@carlnotes/client/teamClient"
import { type SaveTeamOptions as SharedSaveTeamOptions, saveTeam as saveSharedTeam } from "@carlnotes/core/lib/saveTeam"
import type { PendingInvite } from "@carlnotes/core/lib/teamFields"
import { sendPendingInvites } from "@/components/invite/TeamInviteFields"

export type { CreateTeamResult } from "@carlnotes/core/lib/saveTeam"
export { createTeam, createTeamForInviteLink, TEAM_REJECTION_REASONS } from "@carlnotes/core/lib/saveTeam"
export type SaveTeamOptions = Omit<SharedSaveTeamOptions<File>, "uploadAvatar" | "sendInvites"> & {
	onInviteAccepted?: (invite: PendingInvite) => void
}

/**
 * Saves a team through the shared flow with browser uploads and invitation feedback.
 */
export function saveTeam(options: SaveTeamOptions): Promise<string | null> {
	return saveSharedTeam({
		...options,
		uploadAvatar: sendTeamAvatar,
		sendInvites: (id, invites) => sendPendingInvites(id, invites, options.onInviteAccepted),
	})
}
