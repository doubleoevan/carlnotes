// the untrusted fence test fixtures: the pattern that matches each fence that fenceUntrusted writes, and the reader
// that returns each fence's nonce and value
import { UNTRUSTED_DATA_TAG } from "./write"

// one untrusted fence: the open tag with its uuid nonce, the value on its own lines, and the close tag with that nonce
export const UNTRUSTED_FENCE_PATTERN = new RegExp(
	`<${UNTRUSTED_DATA_TAG}-([0-9a-f-]{36})>\\n([\\s\\S]*?)\\n</${UNTRUSTED_DATA_TAG}-\\1>`,
	"g",
)

// one untrusted fence's nonce and the value inside it
export type UntrustedFence = { nonce: string; value: string }

/**
 * Returns the nonce and the value of every untrusted fence in a text, in the text's order.
 */
export function toUntrustedFences(text: string): UntrustedFence[] {
	return [...text.matchAll(UNTRUSTED_FENCE_PATTERN)].map((fenceMatch) => ({
		nonce: fenceMatch[1] ?? "",
		value: fenceMatch[2] ?? "",
	}))
}
