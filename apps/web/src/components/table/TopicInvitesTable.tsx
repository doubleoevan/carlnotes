import { sendDeleteTopicInvite } from "@carlnotes/client/activityClient"
import type { InviteRow } from "@carlnotes/contracts/invites"
import { toTopicPath } from "@carlnotes/contracts/seo"
import {
	TOPIC_INVITES_TABLE_LABELS as SHARED_TOPIC_INVITES_TABLE_LABELS,
	toTopicInviteConfirmation,
} from "@carlnotes/core/lib/sentInvitesTableColumns"
import { AnchorLink } from "@/components/common/AnchorLink"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { type SentInviteRow, SentInvitesTable, type SentInvitesTableLabels } from "./SentInvitesTable"

/**
 * The topic invitations table's headers and withdraw confirmation, worded for subscribing to a topic.
 */
export const TOPIC_INVITES_TABLE_LABELS: SentInvitesTableLabels = {
	...SHARED_TOPIC_INVITES_TABLE_LABELS,
	confirmBody: (row) => {
		// emphasize the target inside the shared confirmation text
		const { beforeTarget, target, afterTarget } = toTopicInviteConfirmation(row)
		return (
			<>
				{beforeTarget}
				<span className="font-semibold">{target}</span>
				{afterTarget}
			</>
		)
	},
}

/**
 * Returns a topic invitation's target cell, the topic's name linked to its page, with the name it sorts by.
 */
export function toTopicInviteTarget({
	topicId,
	name,
}: {
	topicId: string
	name: string
}): Pick<SentInviteRow, "target" | "targetName"> {
	return {
		target: (
			<AnchorLink href={toTopicPath({ id: topicId, name })} className={STANDALONE_LINK_CLASS}>
				{name}
			</AnchorLink>
		),
		targetName: name,
	}
}

/**
 * The Activity page's topic invitations table: who the user invited to their topics and whether each one subscribed.
 * It uses the same table that the Teams page uses for team invitations.
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
		...toTopicInviteTarget(inviteRow),
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
			{...TOPIC_INVITES_TABLE_LABELS}
			inviteRows={inviteRows}
			onDeleteInvite={isReadOnly ? undefined : handleDeleteTopicInvite}
		/>
	)
}
