import type { TopicDraftTeam } from "@carlnotes/contracts/topicPayloads"
import { TopicEditorChoice, type TopicEditorChoiceElements } from "@carlnotes/core/components/TopicEditorChoice"
import { router } from "expo-router"
import { type ComponentProps, useState } from "react"
import { View } from "react-native"
import { CoffeeCup } from "@/components/branding/CoffeeCup"
import { toEditTopicChatHref, toNewTopicChatHref } from "@/components/chat/chatNavigation"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { EditTopicModal } from "./EditTopicModal"

/**
 * The sheet that asks whether to use the form or Carl, editing the topic whose id it has or making a new one without.
 */
export function TopicEditorChoiceSheet({
	topicId,
	initialTeam,
	onChooseTopicForm,
	onClose,
}: {
	topicId?: string
	// the team a new topic starts on, given to the new-topic chat when Carl is chosen
	initialTeam?: TopicDraftTeam
	onChooseTopicForm: () => void
	onClose: () => void
}) {
	// the chat choice closes the sheet and opens the new-topic chat, or the topic's private chat to edit it
	const handleChooseChat = (): void => {
		onClose()
		router.push(topicId === undefined ? toNewTopicChatHref(initialTeam) : toEditTopicChatHref(topicId))
	}
	return (
		<TopicEditorChoice
			isEditingTopic={topicId !== undefined}
			onChooseTopicForm={onChooseTopicForm}
			onChooseChat={handleChooseChat}
			onClose={onClose}
			elements={TOPIC_EDITOR_CHOICE_ELEMENTS}
		/>
	)
}

/**
 * The New Topic choice first, then the create form if the user picks it.
 */
export function NewTopicDialog({
	initialTeam,
	onClose,
	onTopicSaved,
}: Pick<ComponentProps<typeof EditTopicModal>, "initialTeam" | "onClose" | "onTopicSaved">) {
	const [isFormChosen, setIsFormChosen] = useState(false)
	if (isFormChosen) {
		return <EditTopicModal initialTeam={initialTeam} onClose={onClose} onTopicSaved={onTopicSaved} />
	}
	return (
		<TopicEditorChoiceSheet
			initialTeam={initialTeam}
			onChooseTopicForm={() => setIsFormChosen(true)}
			onClose={onClose}
		/>
	)
}

/**
 * The Edit topic choice first, then the edit form if the user picks it.
 */
export function EditTopicDialog({
	topic,
	onClose,
	onTopicSaved,
}: Required<Pick<ComponentProps<typeof EditTopicModal>, "topic" | "onClose" | "onTopicSaved">>) {
	const [isFormChosen, setIsFormChosen] = useState(false)
	if (isFormChosen) {
		return <EditTopicModal topic={topic} onClose={onClose} onTopicSaved={onTopicSaved} />
	}
	return <TopicEditorChoiceSheet topicId={topic.id} onChooseTopicForm={() => setIsFormChosen(true)} onClose={onClose} />
}

// the bottom sheet in place of the web's dialog, with Carl's choice on top as on a phone's web page
const TOPIC_EDITOR_CHOICE_ELEMENTS: TopicEditorChoiceElements = {
	Frame: ({ title, description, onClose, children }) => (
		<Sheet title={title} onClose={onClose}>
			<Text className="text-sm text-muted-foreground">{description}</Text>
			<View className="mt-4 flex-col-reverse gap-2">{children}</View>
		</Sheet>
	),
	FormButton: ({ label, onPress }) => (
		<Button variant="outline" accessibilityLabel={label} onPress={onPress}>
			<Text>{label}</Text>
		</Button>
	),
	ChatButton: ({ label, onPress }) => (
		<Button accessibilityLabel={label} onPress={onPress}>
			<CoffeeCup size={24} />
			<Text>{label}</Text>
		</Button>
	),
}
