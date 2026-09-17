import type { TopicDraftTeam } from "@shared/contracts"
import { type ComponentProps, useState } from "react"
import { CoffeeCup } from "@/components/branding/CoffeeCup"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { isWideScreen } from "@/lib/utils"
import { openNewTopicChat, setChatId, setChatPanelState, startEditingTopic } from "@/stores/chatPanelStore"

/**
 * The dialog that asks whether to use the form or Carl, editing the topic whose id it has or making a new one without.
 */
export function TopicEditorChoiceDialog({
	topicId,
	initialTeam,
	onChooseTopicForm,
	onClose,
}: {
	topicId?: string
	// the team a new topic starts on, handed to the new-topic chat when carl is chosen
	initialTeam?: TopicDraftTeam
	onChooseTopicForm: () => void
	onClose: () => void
}) {
	const isEditingTopic = topicId !== undefined
	// the chat choice opens the panel on the chat and closes the dialog
	const handleChooseChat = (): void => {
		if (topicId === undefined) {
			openNewTopicChat(initialTeam)
		} else {
			// mark the topic as being edited, then open the panel on its chat
			startEditingTopic(topicId)
			setChatId({ kind: "private", topicId })
			setChatPanelState(isWideScreen() ? "open" : "enlarged")
		}
		onClose()
	}
	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle>{isEditingTopic ? "Edit topic" : "New topic"}</DialogTitle>
				<DialogDescription>{isEditingTopic ? "Let's get to work" : "Let's get started"}</DialogDescription>
				<DialogFooter className="mt-2 flex-col-reverse sm:flex-row">
					<Button variant="outline" onClick={onChooseTopicForm}>
						Do it myself
					</Button>
					<Button onClick={handleChooseChat}>
						<CoffeeCup className="size-6" />
						{isEditingTopic ? "Edit with Carl" : "Build with Carl"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

/**
 * The New Topic button's dialogs: the choice first, then the create form when the user picks it.
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
		<TopicEditorChoiceDialog
			initialTeam={initialTeam}
			onChooseTopicForm={() => setIsFormChosen(true)}
			onClose={onClose}
		/>
	)
}
