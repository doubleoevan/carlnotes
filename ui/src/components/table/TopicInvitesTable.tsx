import type { ActivityResponse } from "@shared/contracts"
import { sendDeleteTopicInvite } from "@/clients/activityClient"
import { AnchorLink } from "@/components/common/AnchorLink"
import { type SentInviteRow, SentInvitesTable } from "@/components/table/SentInvitesTable"

// one invite the user sent on a topic they own
type InviteRow = ActivityResponse["invites"][number]

/**
 * The Activity page's topic invitations table: who the user invited to their topics and whether each one subscribed.
 * Using the same table that the Team page uses for team invitations.
 */
export function TopicInvitesTable({
	invites,
	onReload,
	isReadOnly = false,
}: {
	invites: InviteRow[]
	onReload: () => void
	// an admin reading another user's page cannot withdraw their invitations
	isReadOnly?: boolean
}) {
	// topic invitations in the shape of invite table rows
	const inviteRows = invites.map((inviteRow) => ({
		inviteId: inviteRow.inviteId,
		target: (
			<AnchorLink href={`/topics/${inviteRow.topicId}`} className="text-link hover:underline">
				{inviteRow.name}
			</AnchorLink>
		),
		targetName: inviteRow.name,
		invitee: inviteRow.invitee,
		inviteeEmail: inviteRow.inviteeEmail,
		invitedAt: inviteRow.invitedAt,
		acceptedAt: inviteRow.subscribedAt,
	}))

	// deleting a topic invite drops the invitee's subscription with the invitation
	const handleDeleteTopicInvite = async (sentInviteRow: SentInviteRow): Promise<void> => {
		const deleteInvite = invites.find((invite) => invite.inviteId === sentInviteRow.inviteId)
		if (deleteInvite) {
			await sendDeleteTopicInvite(deleteInvite.topicId, deleteInvite.inviteId)
		}
		onReload()
	}

	return (
		<SentInvitesTable
			inviteRows={inviteRows}
			targetLabel="Topic"
			acceptedLabel="Followed"
			acceptedNoun="subscribed"
			confirmTitle="Delete this invitation?"
			confirmLabel="Delete invitation"
			confirmBody={(row) => (
				<>
					{`${row.inviteeEmail ?? row.invitee?.username ?? "This invitee"} loses access to `}
					<span className="font-semibold">{row.targetName}</span>, and their subscription goes with it. Inviting them
					again starts over.
				</>
			)}
			onDeleteInvite={isReadOnly ? undefined : handleDeleteTopicInvite}
		/>
	)
}
