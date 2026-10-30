import type { ComponentType, ReactNode } from "react"

// the choice's words: making a new topic, or editing the one open
const TOPIC_EDITOR_CHOICE_COPY = {
	new: { title: "New topic", description: "Let's get started", chatLabel: "Build with Carl" },
	edit: { title: "Edit topic", description: "Let's get to work", chatLabel: "Edit with Carl" },
	formLabel: "Do it myself",
}

export type TopicEditorChoiceElements = {
	Frame: ComponentType<{ title: string; description: string; onClose: () => void; children: ReactNode }>
	FormButton: ComponentType<{ label: string; onPress: () => void }>
	ChatButton: ComponentType<{ label: string; onPress: () => void }>
}

/**
 * The choice between the topic form and Carl, for a new topic or the one being edited. The app frames it and opens
 * whichever was chosen.
 */
export function TopicEditorChoice({
	isEditingTopic,
	onChooseTopicForm,
	onChooseChat,
	onClose,
	elements: { Frame, FormButton, ChatButton },
}: {
	isEditingTopic: boolean
	onChooseTopicForm: () => void
	onChooseChat: () => void
	onClose: () => void
	elements: TopicEditorChoiceElements
}) {
	const copy = isEditingTopic ? TOPIC_EDITOR_CHOICE_COPY.edit : TOPIC_EDITOR_CHOICE_COPY.new
	return (
		<Frame title={copy.title} description={copy.description} onClose={onClose}>
			<FormButton label={TOPIC_EDITOR_CHOICE_COPY.formLabel} onPress={onChooseTopicForm} />
			<ChatButton label={copy.chatLabel} onPress={onChooseChat} />
		</Frame>
	)
}
