// the opaque cursor a paged read returns and a later page passes back, as base64url json a caller never reads

import type { z } from "zod"

/**
 * Returns a cursor's value as the opaque text a page returns.
 */
export function toJsonCursor(cursorValue: unknown): string {
	return Buffer.from(JSON.stringify(cursorValue)).toString("base64url")
}

/**
 * Returns the value a cursor's text holds, or null if the text is not a cursor the schema reads.
 */
export function parseJsonCursor<CursorSchema extends z.ZodType>(
	cursorSchema: CursorSchema,
	cursorText: string,
): z.infer<CursorSchema> | null {
	try {
		const parsedCursor = cursorSchema.safeParse(JSON.parse(Buffer.from(cursorText, "base64url").toString()))
		return parsedCursor.success ? parsedCursor.data : null
	} catch {
		return null
	}
}
