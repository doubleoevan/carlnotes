import type { ReactNode } from "react"

// the props of each app's confirmation dialog, as a shared component's Confirm element takes them
export type ConfirmElementProps = {
	title: string
	children: ReactNode
	confirmLabel: string
	cancelLabel: string
	onConfirm: () => Promise<void>
	onClose: () => void
}
