import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { cn, copyWithDocument } from "@/lib/utils"

// how long the copied checkmark stays before the button offers to copy again
const COPIED_FEEDBACK_MS = 1500

/**
 * The hover copy button on a notes scroll box: it copies the box's content to the clipboard as Markdown ready to paste into an AI,
 * and confirms with a checkmark before reverting. It floats on the corner of a `group` container, appearing on hover or keyboard focus.
 */
export function CopyMarkdownButton({ markdown }: { markdown: string }) {
	const [isCopied, setIsCopied] = useState(false)
	// controlled so the copied confirmation survives the click. a tooltip closes when its trigger is clicked
	const [isTooltipOpen, setIsTooltipOpen] = useState(false)

	// copy, then confirm on the button. a browser that refuses the clipboard api falls back to a selection copy
	async function handleCopy(): Promise<void> {
		let isWritten = true
		try {
			await navigator.clipboard.writeText(markdown)
		} catch {
			isWritten = copyWithDocument(markdown)
		}
		if (isWritten) {
			setIsCopied(true)
			setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS)
		}
	}

	return (
		<Tooltip open={isCopied || isTooltipOpen} onOpenChange={setIsTooltipOpen}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={handleCopy}
					aria-label="Copy Markdown for AI"
					className={cn(
						"bg-card/90 text-muted-foreground hover:text-foreground absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-md border opacity-0 shadow-lift transition-opacity focus-visible:opacity-100 group-hover:opacity-100",
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
