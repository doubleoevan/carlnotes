import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react"
import { Alert } from "react-native"

/**
 * Presents the shared confirmation copy in the platform's destructive confirmation alert.
 */
export function ConfirmDialog({
	title,
	children,
	confirmLabel,
	cancelLabel = "Cancel",
	onConfirm,
	onClose,
}: {
	title: string
	children: ReactNode
	confirmLabel: string
	cancelLabel?: string
	onConfirm: () => Promise<void>
	onClose: () => void
}) {
	// retain the latest callbacks without reopening an already presented alert
	const callbacks = useRef({ onConfirm, onClose })
	useLayoutEffect(() => {
		callbacks.current = { onConfirm, onClose }
	}, [onConfirm, onClose])

	// present the committed confirmation copy
	useEffect(() => {
		Alert.alert(
			title,
			typeof children === "string" ? children : undefined,
			[
				{ text: cancelLabel, style: "cancel", onPress: () => callbacks.current.onClose() },
				{
					text: confirmLabel,
					style: "destructive",
					onPress: () => {
						void callbacks.current.onConfirm()
					},
				},
			],
			{ cancelable: true, onDismiss: () => callbacks.current.onClose() },
		)
	}, [title, children, cancelLabel, confirmLabel])
	return null
}
