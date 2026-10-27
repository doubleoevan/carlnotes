import { sendDeleteTopicInvite } from "@carlnotes/client/activityClient"
import type { ActivityResponse } from "@carlnotes/contracts/activity"
import { TOPIC_INVITES_TABLE_LABELS } from "@carlnotes/core/lib/sentInvitesTableColumns"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Text } from "@/components/primitives/text"
import { SentInvitesTable } from "./SentInvitesTable"

/**
 * Lists topic invitations using the shared invitation table and server permissions.
 */
export function TopicInvitesTable({
	invites,
	onReload,
}: {
	invites: ActivityResponse["invites"]
	onReload: () => void
}) {
	const rows = invites.map((invite) => ({
		...invite,
		targetName: invite.name,
		acceptedAt: invite.subscribedAt,
		target: (
			<AnchorLink href={`/topics/${invite.topicId}`} accessibilityLabel={invite.name}>
				<Text className="text-sm text-link">{invite.name}</Text>
			</AnchorLink>
		),
	}))
	return (
		<SentInvitesTable
			inviteRows={rows}
			{...TOPIC_INVITES_TABLE_LABELS}
			onDeleteInvite={async (row) => {
				const invite = invites.find((invite) => invite.inviteId === row.inviteId)
				if (invite) {
					await sendDeleteTopicInvite(invite.topicId, invite.inviteId)
				}
			}}
			onReload={onReload}
		/>
	)
}
