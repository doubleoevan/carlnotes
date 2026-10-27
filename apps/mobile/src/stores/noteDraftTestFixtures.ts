import type { NoteDraftStorage } from "./noteDraftStore"

/**
 * Retains serialized draft values and records ordered storage writes for lifecycle tests.
 */
export function toNoteDraftStorage(): NoteDraftStorage & { values: Map<string, string>; writes: string[] } {
	const values = new Map<string, string>()
	const writes: string[] = []
	return {
		values,
		writes,
		getItem: async (key) => values.get(key) ?? null,
		setItem: async (key, value) => {
			writes.push(value)
			values.set(key, value)
		},
		removeItem: async (key) => {
			values.delete(key)
		},
	}
}
export const NOTE_DRAFT_CONTEXT = {
	pageType: "topic" as const,
	pageId: "topic-1",
	pageName: "Coffee",
	creatableVisibilities: ["private" as const],
}
