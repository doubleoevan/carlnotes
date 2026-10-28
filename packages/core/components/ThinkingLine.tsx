import { type ComponentType, useState } from "react"
import { randomThinkingLine } from "../lib/thinkingLines"

export type ThinkingLineTextProps = { children: string; className?: string }

/**
 * Keeps one shared thinking line stable until its waiting state unmounts.
 */
export function ThinkingLine({ Text, className }: { Text: ComponentType<ThinkingLineTextProps>; className?: string }) {
	// retain the selected phrase for the waiting state
	const [thinkingLine] = useState(randomThinkingLine)
	return <Text className={className}>{`Carl is ${thinkingLine}…`}</Text>
}
