// source seeds and counts use the same implicit defaults as Topic Draft creation
import { toCanonicalUrl } from "@carlnotes/contracts/canonicalUrl"
import { DEFAULT_SOURCES } from "@carlnotes/contracts/sources"
import { type AddTopicSourcePayload, addTopicSourcePayload } from "@carlnotes/contracts/topicPayloads"
import { MAX_TOPIC_SOURCES } from "@carlnotes/contracts/topics"

/**
 * Seeds every chat link before recommendations without dropping an explicit link to fit the Source limit.
 */
export function toMcpTopicDraftSources({
	links,
	suggestions,
}: {
	links: string[]
	suggestions: unknown
}): AddTopicSourcePayload[] {
	// canonical URL Sources retain their first position
	const recommendedSources = Array.isArray(suggestions) ? suggestions : []
	const sources: AddTopicSourcePayload[] = []
	const keys = new Set<string>()
	for (const source of [...links.map((value) => ({ sourceOption: "url", value })), ...recommendedSources]) {
		const parsed = addTopicSourcePayload.safeParse(source)
		if (!parsed.success || DEFAULT_SOURCES.some((option) => option.key === parsed.data.sourceOption)) {
			continue
		}
		const normalized = {
			...parsed.data,
			value: parsed.data.sourceOption === "url" ? toCanonicalUrl(parsed.data.value) : parsed.data.value,
		}
		const key = JSON.stringify(normalized)
		if (keys.has(key)) {
			continue
		}
		const isChatLink =
			normalized.sourceOption === "url" && links.some((link) => toCanonicalUrl(link) === normalized.value)
		if (!isChatLink && countMcpTopicDraftSources(sources) >= MAX_TOPIC_SOURCES) {
			continue
		}
		keys.add(key)
		sources.push(normalized)
	}
	return sources
}

/**
 * Counts the implicit built-in Sources once alongside the draft's custom Sources.
 */
export function countMcpTopicDraftSources(sources: AddTopicSourcePayload[]): number {
	return (
		DEFAULT_SOURCES.length +
		sources.filter((source) => !DEFAULT_SOURCES.some((option) => option.key === source.sourceOption)).length
	)
}
