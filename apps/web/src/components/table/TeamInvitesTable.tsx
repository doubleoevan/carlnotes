import { sendDeleteTeamInvite } from "@carlnotes/client/teamClient"
import type { TeamsPageResponse } from "@carlnotes/contracts/teams"
import { TEAM_INVITES_TABLE_LABELS } from "@carlnotes/core/lib/sentInvitesTableColumns"
import { TeamLink } from "@/components/team/TeamLink"
import { type SentInviteRow, SentInvitesTable } from "./SentInvitesTable"

export { TEAM_INVITES_TABLE_LABELS } from "@carlnotes/core/lib/sentInvitesTableColumns"

/**
 * The Teams page's team invitations table: who the member invited to their team and whether each one joined.
 * It uses the same table that the Activity page uses for topic invitations.
 */
export function SentTeamInvitesTable({
	invites,
	onReload,
}: {
	invites: TeamsPageResponse["sentInvites"]
	onReload: () => void
}) {
	// team invitations in the shape of invite table rows
	const inviteRows = invites.map((invite) => ({
		inviteId: invite.inviteId,
		target: <TeamLink team={invite} label="" />,
		targetName: invite.name,
		invitee: invite.invitee,
		inviteeEmail: invite.inviteeEmail,
		invitedAt: invite.invitedAt,
		acceptedAt: invite.joinedAt,
	}))

	// delete a team invitation. a member who already joined stays on the team
	const handleDeleteTeamInvite = async (sentInviteRow: SentInviteRow): Promise<void> => {
		const deleteInvite = invites.find((invite) => invite.inviteId === sentInviteRow.inviteId)
		if (deleteInvite) {
			await sendDeleteTeamInvite(deleteInvite.teamId, deleteInvite.inviteId)
		}
		onReload()
	}

	return (
		<SentInvitesTable {...TEAM_INVITES_TABLE_LABELS} inviteRows={inviteRows} onDeleteInvite={handleDeleteTeamInvite} />
	)
}
