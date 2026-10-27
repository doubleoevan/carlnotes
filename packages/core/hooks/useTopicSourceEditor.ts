import { fetchSourceSuggestions } from "@carlnotes/client/topicClient"
import { KEEP_ONE_SOURCE_MESSAGE, toCustomSourceOption } from "@carlnotes/contracts/sources"
import { MAX_TOPIC_SOURCES } from "@carlnotes/contracts/topics"
import { useEffect, useRef, useState } from "react"
import { toExcludedSources } from "../lib/topicSourceEditor"
import type { TopicFields } from "./useTopicFields"

const MAX_SUGGESTIONS = 3

// the same staged Sources and picker controls back both platform forms
export type TopicSourceEditorState<Attachment> = Pick<
	TopicFields<Attachment>,
	"defaultSourceKeys" | "keptSources" | "addedSources" | "setKeptSources" | "setAddedSources"
> & {
	isAdding: boolean
	setIsAdding: (isAdding: boolean) => void
	newOptionKey: string
	setNewOptionKey: (key: string) => void
	newValue: string
	setNewValue: (value: string) => void
	isSuggestingSources: boolean
	newOption: ReturnType<typeof toCustomSourceOption>
	isFull: boolean
	hasTopicWords: boolean
	sourceSlotsLeft: number
	handleSuggestSources: () => Promise<void>
	removeSource: (remove: () => void) => void
	handleAddDefaultSource: (key: string) => void
	handleRemoveDefaultSource: (key: string) => void
	handleAddSource: () => void
	handleCancelAdd: () => void
}

/**
 * Shares Source editing and recommendations between the web and native Topic forms.
 */
export function useTopicSourceEditor<Attachment>(
	fields: TopicFields<Attachment>,
	onNotice: (message: string) => void,
): TopicSourceEditorState<Attachment> {
	// merge a delayed recommendation into the latest selections
	const latestFields = useRef(fields)
	useEffect(() => {
		latestFields.current = fields
	}, [fields])
	// the fields the editor reads, and the setters it writes through
	const {
		defaultSourceKeys,
		keptSources,
		addedSources,
		promptSourceUrls,
		name: topicName,
		prompt: topicPrompt,
		attachmentContext: topicAttachmentContext,
		setDefaultSourceKeys,
		setKeptSources,
		setAddedSources,
	} = fields
	// the add-source picker's open state with its pending option and value
	const [isAdding, setIsAdding] = useState(false)
	const [newOptionKey, setNewOptionKey] = useState("rss")
	const [newValue, setNewValue] = useState("")
	// the suggest sources request in progress, which replaces the Recommend button with a thinking line while it runs
	const [isSuggestingSources, setIsSuggestingSources] = useState(false)

	// the option the picker is on, which names the value input's placeholder
	const newOption = toCustomSourceOption(newOptionKey)
	// a topic needs somewhere to look, so the last remaining source cannot be removed
	const totalSources = defaultSourceKeys.length + keptSources.length + addedSources.length + promptSourceUrls.length
	const sourceSlotsLeft = MAX_TOPIC_SOURCES - totalSources
	const isFull = sourceSlotsLeft <= 0

	// suggesting a source reads the topic's own words, so a topic that describes nothing yet has nothing to read
	const hasTopicWords = Boolean(topicName.trim() || topicPrompt.trim())

	// ask for what the topic can hold, and tell the api everything it already reads so nothing repeats
	const handleSuggestSources = async (): Promise<void> => {
		if (isFull || isSuggestingSources) {
			return
		}
		setIsSuggestingSources(true)
		try {
			const suggestions = await fetchSourceSuggestions({
				name: topicName,
				prompt: topicPrompt,
				attachmentContext: topicAttachmentContext,
				excludeSources: toExcludedSources(keptSources, addedSources, promptSourceUrls),
				limit: Math.min(MAX_SUGGESTIONS, sourceSlotsLeft),
			})
			if (suggestions.length === 0) {
				onNotice("Carl couldn't think of any.\n Try again in a moment.")
				return
			}

			// a suggestion names the option it is added through, which stages it with its display name
			const suggestedSources = suggestions.map((suggestion) => ({
				optionKey: suggestion.sourceOption,
				value: suggestion.value,
				name: suggestion.name,
			}))
			// merge recommendations into the current selections and remaining capacity
			const currentTopicFields = latestFields.current
			const excludedSources = toExcludedSources(
				currentTopicFields.keptSources,
				currentTopicFields.addedSources,
				currentTopicFields.promptSourceUrls,
			)
			const availableSourceCount = Math.max(
				0,
				MAX_TOPIC_SOURCES -
					currentTopicFields.defaultSourceKeys.length -
					currentTopicFields.keptSources.length -
					currentTopicFields.addedSources.length -
					currentTopicFields.promptSourceUrls.length,
			)
			const newSuggestedSources = suggestedSources
				.filter(
					(source) =>
						!excludedSources.some(
							(excludedSource) =>
								excludedSource.sourceOption === source.optionKey && excludedSource.value === source.value,
						),
				)
				.slice(0, availableSourceCount)
			setAddedSources([...currentTopicFields.addedSources, ...newSuggestedSources])
		} catch (error) {
			console.error("source suggestions failed", error)
			onNotice("Carl couldn't think of any.\n Try again in a moment.")
		} finally {
			setIsSuggestingSources(false)
		}
	}

	// remove a source, but show a toast if that would leave the topic with no source at all
	const removeSource = (remove: () => void): void => {
		if (totalSources <= 1) {
			onNotice(KEEP_ONE_SOURCE_MESSAGE)
			return
		}
		remove()
	}

	// a default source turns on by adding its key and off by dropping it. the save builds its config from the registry
	const handleAddDefaultSource = (key: string): void => {
		if (!isFull && !defaultSourceKeys.includes(key)) {
			setDefaultSourceKeys([...defaultSourceKeys, key])
		}
	}
	const handleRemoveDefaultSource = (key: string): void =>
		removeSource(() => setDefaultSourceKeys(defaultSourceKeys.filter((defaultKey) => defaultKey !== key)))

	// stage the selected source and reset the picker, skipping an exact duplicate
	const handleAddSource = (): void => {
		const value = newValue.trim()
		const isDuplicateSource = toExcludedSources(keptSources, addedSources, promptSourceUrls).some(
			(source) => source.sourceOption === newOptionKey && source.value === value,
		)
		if (value && !isDuplicateSource && !isFull) {
			setAddedSources([...addedSources, { optionKey: newOptionKey, value }])
		}
		setNewValue("")
		setIsAdding(false)
	}

	// back out of the add-source picker without staging anything
	const handleCancelAdd = (): void => {
		setNewValue("")
		setIsAdding(false)
	}

	return {
		defaultSourceKeys,
		keptSources,
		addedSources,
		setKeptSources,
		setAddedSources,
		isAdding,
		setIsAdding,
		newOptionKey,
		setNewOptionKey,
		newValue,
		setNewValue,
		isSuggestingSources,
		newOption,
		isFull,
		hasTopicWords,
		sourceSlotsLeft,
		handleSuggestSources,
		removeSource,
		handleAddDefaultSource,
		handleRemoveDefaultSource,
		handleAddSource,
		handleCancelAdd,
	}
}
