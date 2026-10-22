import type * as React from "react"
import { useState } from "react"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"

/**
 * The confirmation dialog an action opens before it commits, with a question, a body saying what the action does, and an onConfirm callback.
 */
export function ConfirmDialog({
	title,
	confirmLabel,
	cancelLabel,
	onConfirm,
	onClose,
	children,
}: {
	title: string
	confirmLabel: string
	cancelLabel: string
	onConfirm: () => void | Promise<void>
	onClose: () => void
	// what the action does, as prose the caller writes
	children: React.ReactNode
}) {
	const [isPending, setIsPending] = useState(false)

	// run the action once, and ignore both buttons until it settles
	const handleConfirm = async (): Promise<void> => {
		if (isPending) {
			return
		}
		setIsPending(true)
		try {
			await onConfirm()
		} finally {
			setIsPending(false)
		}
	}

	// the cancel button closes the dialog unless the action is still running
	const handleCancel = (): void => {
		if (!isPending) {
			onClose()
		}
	}

	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && !isPending && onClose()}>
			<DialogContent className="sm:max-w-md" isCloseButtonDisabled={isPending}>
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>{children}</DialogDescription>
				<DialogFooter>
					{/* aria-disabled instead of disabled, so the focused button keeps focus while the action runs */}
					<Button variant="ghost" onClick={handleCancel} aria-disabled={isPending}>
						{cancelLabel}
					</Button>
					<Button variant="destructive" onClick={handleConfirm} aria-disabled={isPending}>
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
