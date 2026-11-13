import {
	type NewTopicEmptyCardElements,
	NewTopicEmptyCard as SharedNewTopicEmptyCard,
} from "@carlnotes/core/components/NewTopicEmptyCard"
import { EmptyListCard } from "@/components/table/TableCard"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { openNewTopicChat } from "@/stores/chatPanelStore"

/**
 * A topic list with no topics, whose line opens the new topic chat.
 */
export function NewTopicEmptyCard({ onNewTopicChat = openNewTopicChat }: { onNewTopicChat?: () => void }) {
	return <SharedNewTopicEmptyCard onNewTopic={() => onNewTopicChat()} elements={NEW_TOPIC_EMPTY_CARD_ELEMENTS} />
}

// the web's empty list card, and a button drawn as a link
const NEW_TOPIC_EMPTY_CARD_ELEMENTS: NewTopicEmptyCardElements = {
	Card: EmptyListCard,
	Link: ({ label, onPress }) => (
		<button type="button" onClick={onPress} className={STANDALONE_LINK_CLASS}>
			{label}
		</button>
	),
}
