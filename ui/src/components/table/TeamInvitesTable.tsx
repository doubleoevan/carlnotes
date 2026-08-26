import type { TeamsPageResponse } from "@shared/contracts"
import { sendDeleteTeamInvite } from "@/clients/teamClient"
import { type SentInviteRow, SentInvitesTable } from "@/components/table/SentInvitesTable"
import { TeamLink } from "@/components/team/TeamLink"

/**
 * The Team page's team invitations table: who the member invited to their team and whether each one subscribed.
 * Using the same table that the Activity page uses for topic invitations.
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
		<SentInvitesTable
			inviteRows={inviteRows}
			targetLabel="Team"
			acceptedLabel="Joined"
			acceptedNoun="joined"
			confirmTitle="Withdraw this invitation?"
			confirmLabel="Withdraw it"
			confirmBody={(row) =>
				`The invitation to ${row.inviteeEmail ?? row.invitee?.username ?? "this invitee"} goes away. Anyone who already joined stays.`
			}
			onDeleteInvite={handleDeleteTeamInvite}
		/>
	)
}
