// the shimmering "Carl is ___" line shown while carl works on a reply, a scan, or source suggestions
import { ThinkingLine as SharedThinkingLine, type ThinkingLineTextProps } from "@carlnotes/core/components/ThinkingLine"
import { cn } from "@carlnotes/nightshift/classNames"

/**
 * Shows one "Carl is ___" shimmer line, dealt once so a re-render never swaps it.
 */
export function ThinkingLine({ className }: { className?: string }) {
	return <SharedThinkingLine Text={ThinkingText} className={className} />
}

// keep the existing browser animation and inherited typography
function ThinkingText({ children, className }: ThinkingLineTextProps) {
	return <span className={cn("shimmer-text", className)}>{children}</span>
}
