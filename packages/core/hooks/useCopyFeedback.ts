import { useEffect, useRef, useState } from "react"

// keep clipboard confirmation visible for the same duration in every client
export const COPIED_FEEDBACK_MS = 1500

/**
 * Shows feedback for the latest accepted copy and clears it when the control closes.
 */
export function useCopyFeedback(): { copiedLabel: string | null; markCopied: (label: string) => void } {
	// retire timers and late clipboard acknowledgements with their mounted control
	const [copiedLabel, setCopiedLabel] = useState<string | null>(null)
	const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isMounted = useRef(true)
	useEffect(() => {
		isMounted.current = true
		return () => {
			isMounted.current = false
			if (timeout.current !== null) {
				clearTimeout(timeout.current)
			}
		}
	}, [])

	// extend feedback only after a successful copy
	function markCopied(label: string): void {
		if (!isMounted.current) {
			return
		}
		if (timeout.current !== null) {
			clearTimeout(timeout.current)
		}
		setCopiedLabel(label)
		timeout.current = setTimeout(() => setCopiedLabel(null), COPIED_FEEDBACK_MS)
	}
	return { copiedLabel, markCopied }
}
