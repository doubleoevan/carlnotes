import type { ComponentType } from "react"
import { useCopyFeedback } from "../hooks/useCopyFeedback"

// the clipboard and its accessible feedback belong to the platform
export { COPIED_FEEDBACK_MS } from "../hooks/useCopyFeedback"
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
	const { copiedLabel, markCopied } = useCopyFeedback()

	// confirm only an accepted copy and restart its feedback window
	async function handleCopy(): Promise<void> {
		if (await copyToClipboard(markdown)) {
			markCopied("markdown")
		}
	}
	return <Control isCopied={copiedLabel !== null} onCopy={() => void handleCopy()} />
}
