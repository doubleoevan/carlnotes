import { type ComponentType, useState } from "react"
import { randomThinkingLine } from "../lib/thinkingLines"

// the portable text adapter and the component's own props
export type ThinkingLineTextProps = { children: string; className?: string }
export type ThinkingLineProps = { Text: ComponentType<ThinkingLineTextProps>; className?: string }

/**
 * Keeps one shared thinking line stable until its waiting state unmounts.
 */
export function ThinkingLine({ Text, className }: ThinkingLineProps) {
	// retain the selected phrase for the waiting state
	const [thinkingLine] = useState(randomThinkingLine)
	return <Text className={className}>{`Carl is ${thinkingLine}…`}</Text>
}
