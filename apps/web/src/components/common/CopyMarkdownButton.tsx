import {
	type CopyMarkdownControlProps,
	CopyMarkdownButton as SharedCopyMarkdownButton,
} from "@carlnotes/core/components/CopyMarkdownButton"

export { COPIED_FEEDBACK_MS } from "@carlnotes/core/components/CopyMarkdownButton"

import { cn } from "@carlnotes/nightshift/classNames"
import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { copyToClipboard } from "@/lib/utils"

/**
 * The hover copy button on a notes scroll box: it copies the box's content to the clipboard as Markdown ready to paste into an AI,
 * and confirms with a checkmark before reverting. It sits on the corner of a `group` container, appearing on hover or keyboard focus.
 */
export function CopyMarkdownButton({ markdown }: { markdown: string }) {
	return (
		<SharedCopyMarkdownButton markdown={markdown} copyToClipboard={copyToClipboard} Control={CopyMarkdownControl} />
	)
}

// keep hover and keyboard tooltip state in the browser adapter
function CopyMarkdownControl({ isCopied, onCopy }: CopyMarkdownControlProps) {
	const [isTooltipOpen, setIsTooltipOpen] = useState(false)

	return (
		<Tooltip open={isCopied || isTooltipOpen} onOpenChange={setIsTooltipOpen}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={onCopy}
					aria-label="Copy Markdown for AI"
					className={cn(
						"bg-card/90 text-muted-foreground hover:text-foreground absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-md border opacity-0 shadow-raised transition-opacity focus-visible:opacity-100 group-hover:opacity-100",
						isCopied && "text-primary opacity-100",
					)}
				>
					{isCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
				</button>
			</TooltipTrigger>
			<TooltipContent>{isCopied ? "Copied" : "Copy Markdown for AI"}</TooltipContent>
		</Tooltip>
	)
}
