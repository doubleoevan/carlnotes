import type { ConfirmationCopy } from "@carlnotes/core/lib/confirmationCopy"
import { type ReactNode, useState } from "react"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"

/**
 * Asks before an action runs. `confirm` opens the dialog, and the caller renders `confirmDialog`.
 */
export function useConfirmDialog(): {
	confirm: (copy: ConfirmationCopy, onConfirm: () => void | Promise<void>) => void
	confirmDialog: ReactNode
} {
	const [confirmation, setConfirmation] = useState<{
		copy: ConfirmationCopy
		onConfirm: () => void | Promise<void>
	} | null>(null)

	// run the action, then close the dialog
	const handleConfirm = async (): Promise<void> => {
		await confirmation?.onConfirm()
		setConfirmation(null)
	}
	return {
		confirm: (copy, onConfirm) => setConfirmation({ copy, onConfirm }),
		confirmDialog: confirmation && (
			<ConfirmDialog {...confirmation.copy} onConfirm={handleConfirm} onClose={() => setConfirmation(null)} />
		),
	}
}
