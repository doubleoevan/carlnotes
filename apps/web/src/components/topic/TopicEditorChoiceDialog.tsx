import { authClient } from "@carlnotes/client/authClient"
import type { TopicDraftTeam } from "@carlnotes/contracts/topicPayloads"
import { TopicEditorChoice, type TopicEditorChoiceElements } from "@carlnotes/core/components/TopicEditorChoice"
import { cn } from "@carlnotes/nightshift/classNames"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { type ComponentProps, type ReactNode, useState } from "react"
import { CoffeeCup } from "@/components/branding/CoffeeCup"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { toSignupNavigation } from "@/components/session/signupPrompts"
import { isWideScreen } from "@/lib/utils"
import { openNewTopicChat, setChatId, setChatPanelState, startEditingTopic } from "@/stores/chatPanelStore"
import { EditTopicModal } from "./EditTopicModal"

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
			// open the private conversation and mark its topic as being edited
			setChatId({ kind: "private", topicId })
			startEditingTopic(topicId)
			setChatPanelState(isWideScreen() ? "open" : "enlarged")
		}
		onClose()
	}
	return (
		<TopicEditorChoice
			isEditingTopic={isEditingTopic}
			onChooseTopicForm={onChooseTopicForm}
			onChooseChat={handleChooseChat}
			onClose={onClose}
			elements={TOPIC_EDITOR_CHOICE_ELEMENTS}
		/>
	)
}

// the browser dialog, its outlined form button, and the chat button with Carl's cup
const TOPIC_EDITOR_CHOICE_ELEMENTS: TopicEditorChoiceElements = {
	Frame: ({ title, description, onClose, children }) => (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>{description}</DialogDescription>
				<DialogFooter className="mt-2 flex-col-reverse sm:flex-row">{children}</DialogFooter>
			</DialogContent>
		</Dialog>
	),
	FormButton: ({ label, onPress }) => (
		<Button variant="outline" onClick={onPress}>
			{label}
		</Button>
	),
	ChatButton: ({ label, onPress }) => (
		<Button onClick={onPress}>
			<CoffeeCup className="size-6" />
			{label}
		</Button>
	),
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

/**
 * Returns the new topic dialog and the call that opens the dialog.
 */
export function useNewTopicDialog(onTopicCreated?: () => void): {
	openNewTopicDialog: () => void
	newTopicDialog: ReactNode
} {
	// the router, the session, and whether the dialog is open
	const navigate = useNavigate()
	const { data: session } = authClient().useSession()
	const [isNewTopicDialogOpen, setIsNewTopicDialogOpen] = useState(false)

	// open the dialog for a signed-in user, and send a visitor to sign up first
	const openNewTopicDialog = (): void => {
		if (session) {
			setIsNewTopicDialogOpen(true)
			return
		}
		void navigate(toSignupNavigation("new-topic"))
	}

	// a created topic closes the dialog, opens the topic's page, and runs onTopicCreated
	const handleTopicCreated = async (topicId: string): Promise<void> => {
		setIsNewTopicDialogOpen(false)
		void navigate({ to: "/topics/$topicId", params: { topicId } })
		onTopicCreated?.()
	}

	// the dialog mounts only while open. its form starts empty each time
	const newTopicDialog = isNewTopicDialogOpen ? (
		<NewTopicDialog onClose={() => setIsNewTopicDialogOpen(false)} onTopicSaved={handleTopicCreated} />
	) : null
	return { openNewTopicDialog, newTopicDialog }
}

/**
 * The New Topic button with its plus icon, which calls onNewTopic.
 */
export function NewTopicButton({ className, onNewTopic }: { className?: string; onNewTopic: () => void }) {
	return (
		<Button className={cn("shrink-0", className)} onClick={onNewTopic}>
			<Plus className="size-4" />
			New Topic
		</Button>
	)
}
