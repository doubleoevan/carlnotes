import { type ComponentType, useEffect, useRef, useState } from "react"

// the clipboard and its accessible feedback belong to the platform
export const COPIED_FEEDBACK_MS = 1500
export type CopyMarkdownControlProps = { isCopied: boolean; onCopy: () => void }

/**
 * Renders a copy control with one shared success state and a reset after the latest successful copy.
 */
export function CopyMarkdownButton({
	markdown,
	copyToClipboard,
	Control,
}: {
	markdown: string
	copyToClipboard: (markdown: string) => Promise<boolean>
	Control: ComponentType<CopyMarkdownControlProps>
}) {
	// retire pending feedback when its scrollbox closes
	const [isCopied, setIsCopied] = useState(false)
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isMountedRef = useRef(true)
	useEffect(() => {
		isMountedRef.current = true
		return () => {
			isMountedRef.current = false
			if (timeoutRef.current !== null) {
				clearTimeout(timeoutRef.current)
			}
		}
	}, [])

	// confirm only an accepted copy and restart its feedback window
	async function handleCopy(): Promise<void> {
		if (!(await copyToClipboard(markdown)) || !isMountedRef.current) {
			return
		}
		if (timeoutRef.current !== null) {
			clearTimeout(timeoutRef.current)
		}
		setIsCopied(true)
		timeoutRef.current = setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS)
	}
	return <Control isCopied={isCopied} onCopy={() => void handleCopy()} />
}
