import { ThinkingLine as SharedThinkingLine } from "@carlnotes/core/components/ThinkingLine"
import { ShimmerText } from "./ShimmerText"

/**
 * Adapts the shared thinking line to mobile text and a foreground-only shimmer.
 */
export function ThinkingLine({ className }: { className?: string }) {
	return <SharedThinkingLine Text={ShimmerText} className={className} />
}
