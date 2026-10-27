import { CUSTOM_SOURCE_OPTIONS, type CustomSourceKey, toCustomSourceOption } from "@carlnotes/contracts/sources"
import type { SuggestSourcesPayload } from "@carlnotes/contracts/topicPayloads"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { AddedSource } from "../hooks/useTopicFields"

/**
 * Returns the existing Sources and staged choices that recommendations must exclude.
 */
export function toExcludedSources(
	keptSources: TopicResponse["sources"],
	addedSources: AddedSource[],
	promptSourceUrls: string[],
): SuggestSourcesPayload["excludeSources"] {
	// a staged source already names its option, and a stored one names the kind that option saves as
	const storedSources = keptSources.flatMap((source) => {
		const optionKey = toCustomSourceKey(source.sourceKind)
		return optionKey ? [{ sourceOption: optionKey, value: source.value }] : []
	})
	return [
		...storedSources,
		...addedSources.flatMap((added) => toExcludedStagedSource(added)),
		...promptSourceUrls.map((url) => ({ sourceOption: "url" as const, value: url })),
	]
}

// the option key a stored source's kind belongs to, or undefined for a kind the picker cannot add
function toCustomSourceKey(sourceKind: string): CustomSourceKey | undefined {
	return CUSTOM_SOURCE_OPTIONS.find((option) => option.sourceKind === sourceKind)?.key
}

// a staged source in the shape the api compares by, dropped when its option is one the picker no longer offers
function toExcludedStagedSource(added: AddedSource): SuggestSourcesPayload["excludeSources"] {
	const option = toCustomSourceOption(added.optionKey)
	return option ? [{ sourceOption: option.key, value: added.value }] : []
}
