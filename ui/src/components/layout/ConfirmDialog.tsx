import type * as React from "react"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"

/**
 * The confirmation an action opens before it commits: a question, a body with what the action entails, and an onConfirm callback.
 * The consumer supplies every label so that each confirmation can describe itself.
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
	onConfirm: () => void
	onClose: () => void
	// what the action entails, as prose the caller writes
	children: React.ReactNode
}) {
	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>{children}</DialogDescription>
				<DialogFooter>
					<Button variant="ghost" onClick={onClose}>
						{cancelLabel}
					</Button>
					<Button variant="destructive" onClick={onConfirm}>
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
