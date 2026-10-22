// the shimmering "Carl is ___" line shown while carl works on a reply, a scan, or source suggestions
import { useState } from "react"
import { cn } from "@/lib/utils"
import { randomThinkingLine } from "./thinkingLines"

/**
 * Shows one "Carl is ___" shimmer line, dealt once so a re-render never swaps it.
 */
export function ThinkingLine({ className }: { className?: string }) {
	const [thinkingLine] = useState(randomThinkingLine)
	return <span className={cn("shimmer-text", className)}>{`Carl is ${thinkingLine}…`}</span>
}
