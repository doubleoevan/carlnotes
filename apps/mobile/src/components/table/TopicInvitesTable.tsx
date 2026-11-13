import { sendDeleteTopicInvite } from "@carlnotes/client/activityClient"
import type { InviteRow } from "@carlnotes/contracts/invites"
import {
	TopicInvitesTable as SharedTopicInvitesTable,
	type TopicInvitesTableElements,
} from "@carlnotes/core/components/TopicInvitesTable"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Text } from "@/components/primitives/text"
import { usePageMutation } from "@/hooks/usePageMutation"
import { SENT_INVITES_TABLE_ELEMENTS } from "./SentInvitesTable"

/**
 * Renders the web's topic invites table, whose delete drops the invitee's subscription with the invite.
 */
export function TopicInvitesTable({ invites, onReload }: { invites: InviteRow[]; onReload: () => void }) {
	// one change at a time, with a failed one kept on screen
	const mutation = usePageMutation(onReload)
	return (
		<View className="gap-2">
			<SharedTopicInvitesTable
				invites={invites}
				isDisabled={mutation.isPending}
				onDeleteInvite={(invite) => mutation.run(() => sendDeleteTopicInvite(invite.topicId, invite.inviteId))}
				elements={TOPIC_INVITES_TABLE_ELEMENTS}
			/>
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
		</View>
	)
}

// the sent invites table's elements with the topic's name linked to its screen
const TOPIC_INVITES_TABLE_ELEMENTS: TopicInvitesTableElements = {
	...SENT_INVITES_TABLE_ELEMENTS,
	TopicLink: ({ topicId, name }) => (
		<AnchorLink href={`/topics/${topicId}`} accessibilityLabel={name}>
			<Text className="text-sm text-link">{name}</Text>
		</AnchorLink>
	),
}
