import type { TopicDraftTeam } from "@shared/contracts"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { type ComponentProps, type ReactNode, useState } from "react"
import { authClient } from "@/clients/authClient"
import { CoffeeCup } from "@/components/branding/CoffeeCup"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { cn, isWideScreen } from "@/lib/utils"
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

/**
 * Returns the new topic dialog and the call that opens the dialog.
 */
export function useNewTopicDialog(onTopicCreated?: () => void): {
	openNewTopicDialog: () => void
	newTopicDialog: ReactNode
} {
	// the router, the session, and whether the dialog is open
	const navigate = useNavigate()
	const { data: session } = authClient.useSession()
	const [isNewTopicDialogOpen, setIsNewTopicDialogOpen] = useState(false)

	// open the dialog for a signed-in user, and send a visitor to sign up first
	const openNewTopicDialog = (): void => {
		if (session) {
			setIsNewTopicDialogOpen(true)
			return
		}
		void navigate({ to: "/signup", search: { cta: "new-topic" } })
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
