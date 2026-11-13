import type { InviteRow } from "@carlnotes/contracts/invites"
import type { ComponentType } from "react"
import { TOPIC_INVITES_TABLE_LABELS } from "../lib/sentInvitesTableColumns"
import { SentInvitesTable, type SentInvitesTableElements } from "./SentInvitesTable"

export type TopicInvitesTableElements = SentInvitesTableElements & {
	// the invite's topic, its name linked to its page
	TopicLink: ComponentType<{ topicId: string; name: string }>
}

/**
 * Lists the topic invites a user sent and whether each invitee followed, in the table the Teams page uses for team
 * invites.
 */
export function TopicInvitesTable({
	invites,
	isDisabled,
	onDeleteInvite,
	elements,
}: {
	invites: InviteRow[]
	isDisabled?: boolean
	// deletes an invite, which drops the invitee's subscription with it. without it the table renders read-only
	onDeleteInvite?: (invite: InviteRow) => Promise<void>
	elements: TopicInvitesTableElements
}) {
	// the topic invites in the shape of invite table rows
	const { TopicLink } = elements
	const inviteRows = invites.map((invite) => ({
		inviteId: invite.inviteId,
		target: <TopicLink topicId={invite.topicId} name={invite.name} />,
		targetName: invite.name,
		invitee: invite.invitee,
		inviteeEmail: invite.inviteeEmail,
		invitedAt: invite.invitedAt,
		acceptedAt: invite.subscribedAt,
	}))
	return (
		<SentInvitesTable
			inviteRows={inviteRows}
			labels={TOPIC_INVITES_TABLE_LABELS}
			isDisabled={isDisabled}
			onDeleteInvite={
				onDeleteInvite &&
				(async (row) => {
					// the table row's invite, by its id
					const invite = invites.find((entry) => entry.inviteId === row.inviteId)
					if (invite) {
						await onDeleteInvite(invite)
					}
				})
			}
			elements={elements}
		/>
	)
}
