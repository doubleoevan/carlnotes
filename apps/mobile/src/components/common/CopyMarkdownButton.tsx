import {
	type CopyMarkdownControlProps,
	CopyMarkdownButton as SharedCopyMarkdownButton,
} from "@carlnotes/core/components/CopyMarkdownButton"
import { Check, Copy } from "lucide-react-native"
import { copyText } from "@/clipboard"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"

/**
 * Copies note Markdown from the scrollbox corner with an accessible confirmation.
 */
export function CopyMarkdownButton({ markdown, isInline = false }: { markdown: string; isInline?: boolean }) {
	return (
		<SharedCopyMarkdownButton
			markdown={markdown}
			copyToClipboard={copyText}
			Control={isInline ? InlineCopyMarkdownControl : CopyMarkdownControl}
		/>
	)
}

// the action row keeps both native targets in normal flow
function InlineCopyMarkdownControl(props: CopyMarkdownControlProps) {
	return <CopyMarkdownControl {...props} isInline />
}

// native press and icon rendering surround the shared success state
function CopyMarkdownControl({ isCopied, onCopy, isInline }: CopyMarkdownControlProps & { isInline?: boolean }) {
	return (
		<Button
			variant="outline"
			size={isInline ? "icon" : "icon-sm"}
			className={isInline ? "bg-card/90" : "absolute top-1.5 right-1.5 bg-card/90"}
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
