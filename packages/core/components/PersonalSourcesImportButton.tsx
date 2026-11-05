import { type ReactNode, useState } from "react"
import type { PersonalSourcesImportControlProps } from "./TopicPersonalSources"

type PersonalSourcesImportButtonProps = PersonalSourcesImportControlProps & {
	renderButton: (props: { label: string; onPress: () => void; isDisabled?: boolean }) => ReactNode
	renderDialog: (props: { topicId: string; onImported: () => Promise<void>; onClose: () => void }) => ReactNode
}

/**
 * Opens the shared import flow only after an explicit action.
 */
export function PersonalSourcesImportButton({
	topicId,
	isDisabled,
	onImported,
	renderButton,
	renderDialog,
}: PersonalSourcesImportButtonProps) {
	// unmounting the dialog releases its private preview and local selection
	const [isOpen, setIsOpen] = useState(false)
	return (
		<>
			{/* both platforms share the opener and dialog lifetime */}
			{renderButton({ label: "Import conversations", isDisabled, onPress: () => setIsOpen(true) })}
			{isOpen && renderDialog({ topicId, onImported, onClose: () => setIsOpen(false) })}
		</>
	)
}
