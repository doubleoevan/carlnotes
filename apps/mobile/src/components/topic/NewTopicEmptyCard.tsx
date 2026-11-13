import {
	type NewTopicEmptyCardElements,
	NewTopicEmptyCard as SharedNewTopicEmptyCard,
} from "@carlnotes/core/components/NewTopicEmptyCard"
import { Text } from "@/components/primitives/text"
import { EmptyListCard } from "@/components/table/TableCard"
import { useNewTopicDialog } from "./TopicHomeActions"

/**
 * Renders a topic list with no topics, whose line opens the New Topic dialog.
 */
export function NewTopicEmptyCard({ className }: { className?: string }) {
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog()
	return (
		<>
			<SharedNewTopicEmptyCard
				onNewTopic={openNewTopicDialog}
				className={className}
				elements={NEW_TOPIC_EMPTY_CARD_ELEMENTS}
			/>
			{newTopicDialog}
		</>
	)
}

// the native empty list card, and its line drawn as a link that opens the dialog
const NEW_TOPIC_EMPTY_CARD_ELEMENTS: NewTopicEmptyCardElements = {
	Card: EmptyListCard,
	Link: ({ label, onPress }) => (
		<Text accessibilityRole="button" className="text-sm text-link" onPress={onPress}>
			{label}
		</Text>
	),
}
