import { DEFAULT_SOURCES, toDefaultSource } from "@carlnotes/contracts/sources"
import type { TopicDetails } from "@carlnotes/contracts/topics"

// both renderers use the same source identity, order, and status
export type TopicSourceRow = {
	id: string
	sourceKind: string
	summary: string
	isMuted: boolean
	screeningMessage: string | null
}

/**
 * Lists the default Sources, including those switched off, followed by custom Sources.
 */
export function toTopicSourceRows(sources: TopicDetails["sources"]): TopicSourceRow[] {
	// retain each default's position regardless of whether this Topic enables it
	const defaultKeys = new Set(sources.flatMap((source) => toDefaultSource(source.sourceKind)?.key ?? []))
	const defaults = DEFAULT_SOURCES.map((source) => ({
		id: source.key,
		sourceKind: source.label,
		summary: defaultKeys.has(source.key) ? source.summary : "off",
		isMuted: !defaultKeys.has(source.key),
		screeningMessage: null,
	}))
	const custom = sources
		.filter((source) => !toDefaultSource(source.sourceKind))
		.map((source) => ({
			id: source.id,
			sourceKind: source.sourceKind,
			summary: source.summary,
			isMuted: false,
			screeningMessage: toScreeningMessage(source),
		}))
	return [...defaults, ...custom]
}

/**
 * Describes pending or failed Source screening from the fields the API permits this reader to see.
 */
export function toScreeningMessage(source: { status: string; error: string | null }): string | null {
	if (source.status === "pending") {
		return "checking"
	}
	return source.status === "failed" ? (source.error ?? "failed") : null
}
