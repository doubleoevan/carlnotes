import { type ConfirmationProps, toConfirmationText } from "@carlnotes/core/lib/tableElements"
import { useEffect, useRef } from "react"
import { Alert } from "react-native"

/**
 * Shows a table's delete confirmation as the system alert once it mounts.
 */
export function TableConfirmAlert(props: ConfirmationProps) {
	// the alert opens once per confirmation, and its buttons call the latest callbacks
	const propsRef = useRef(props)
	propsRef.current = props
	useEffect(() => {
		const { title, confirmLabel, cancelLabel, body } = propsRef.current
		Alert.alert(
			title,
			toConfirmationText(body),
			[
				{ text: cancelLabel, style: "cancel", onPress: () => propsRef.current.onClose() },
				{ text: confirmLabel, style: "destructive", onPress: () => void propsRef.current.onConfirm() },
			],
			{ cancelable: true, onDismiss: () => propsRef.current.onClose() },
		)
	}, [])
	return null
}
