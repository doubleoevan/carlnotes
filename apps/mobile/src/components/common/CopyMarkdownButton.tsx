import { showClientError } from "@carlnotes/client/apiClient"
import {
	type CopyMarkdownControlProps,
	CopyMarkdownButton as SharedCopyMarkdownButton,
} from "@carlnotes/core/components/CopyMarkdownButton"
import { Check, Copy } from "lucide-react-native"
import { AccessibilityInfo } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"

/**
 * Copies note Markdown from the scrollbox corner with an accessible confirmation.
 */
export function CopyMarkdownButton({ markdown }: { markdown: string }) {
	return <SharedCopyMarkdownButton markdown={markdown} copyToClipboard={copyMarkdown} Control={CopyMarkdownControl} />
}

// native press and icon rendering surround the shared success state
function CopyMarkdownControl({ isCopied, onCopy }: CopyMarkdownControlProps) {
	return (
		<Button
			variant="outline"
			size="icon-sm"
			className="absolute top-1.5 right-1.5 bg-card/90"
			accessibilityLabel={isCopied ? "Copied" : "Copy Markdown for AI"}
			onPress={onCopy}
		>
			<Icon
				as={isCopied ? Check : Copy}
				className={isCopied ? "size-3.5 text-primary" : "size-3.5 text-muted-foreground"}
			/>
		</Button>
	)
}

// announce a successful native copy and report clipboard failures
async function copyMarkdown(markdown: string): Promise<boolean> {
	try {
		const clipboard = await import("expo-clipboard")
		await clipboard.setStringAsync(markdown)
		AccessibilityInfo.announceForAccessibility("Copied")
		return true
	} catch {
		showClientError("That didn't copy. Try again.")
		return false
	}
}
