import { sendDeleteTeamInvite } from "@carlnotes/client/teamClient"
import type { TeamsPageResponse } from "@carlnotes/contracts/teams"
import { TEAM_INVITES_TABLE_LABELS } from "@carlnotes/core/lib/sentInvitesTableColumns"
import { TeamLink } from "@/components/team/TeamLink"
import { SentInvitesTable } from "./SentInvitesTable"

/**
 * Shows the team's sent invitations through the same shared invitation table.
 */
export function SentTeamInvitesTable({
	invites,
	onReload,
}: {
	invites: TeamsPageResponse["sentInvites"]
	onReload: () => void
}) {
	const rows = invites.map((invite) => ({
		...invite,
		target: <TeamLink team={invite} />,
		targetName: invite.name,
		acceptedAt: invite.joinedAt,
	}))
	return (
		<SentInvitesTable
			inviteRows={rows}
			{...TEAM_INVITES_TABLE_LABELS}
			onDeleteInvite={async (row) => {
				const invite = invites.find((invite) => invite.inviteId === row.inviteId)
				if (invite) {
					await sendDeleteTeamInvite(invite.teamId, invite.inviteId)
				}
			}}
			onReload={onReload}
		/>
	)
}
