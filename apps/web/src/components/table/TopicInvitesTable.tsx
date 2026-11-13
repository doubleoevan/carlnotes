import { sendDeleteTopicInvite } from "@carlnotes/client/activityClient"
import type { InviteRow } from "@carlnotes/contracts/invites"
import { toTopicPath } from "@carlnotes/contracts/seo"
import {
	TopicInvitesTable as SharedTopicInvitesTable,
	type TopicInvitesTableElements,
} from "@carlnotes/core/components/TopicInvitesTable"
import { AnchorLink } from "@/components/common/AnchorLink"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { SENT_INVITES_TABLE_ELEMENTS } from "./SentInvitesTable"

/**
 * The Activity page's topic invites table: who the user invited to their topics and whether each one followed.
 */
export function TopicInvitesTable({
	invites,
	onReload,
	isReadOnly = false,
}: {
	invites: InviteRow[]
	onReload: () => void
	// an admin reading another user's page cannot withdraw their invites
	isReadOnly?: boolean
}) {
	// deleting a topic invite drops the invitee's subscription with it
	const handleDeleteInvite = async (invite: InviteRow): Promise<void> => {
		await sendDeleteTopicInvite(invite.topicId, invite.inviteId)
		onReload()
	}
	return (
		<SharedTopicInvitesTable
			invites={invites}
			onDeleteInvite={isReadOnly ? undefined : handleDeleteInvite}
			elements={TOPIC_INVITES_TABLE_ELEMENTS}
		/>
	)
}

// the sent invites table's elements with the topic's name linked to its page
const TOPIC_INVITES_TABLE_ELEMENTS: TopicInvitesTableElements = {
	...SENT_INVITES_TABLE_ELEMENTS,
	TopicLink: ({ topicId, name }) => (
		<AnchorLink href={toTopicPath({ id: topicId, name })} className={STANDALONE_LINK_CLASS}>
			{name}
		</AnchorLink>
	),
}
