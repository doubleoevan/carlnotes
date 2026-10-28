import { CUSTOM_SOURCE_OPTIONS, DEFAULT_SOURCES, toCustomSourceOption } from "@carlnotes/contracts/sources"
import type { TopicFields } from "@carlnotes/core/hooks/useTopicFields"
import { useTopicSourceEditor } from "@carlnotes/core/hooks/useTopicSourceEditor"
import { toScreeningMessage, toStagedTopicSourceSummary } from "@carlnotes/core/lib/topicSources"
import { Plus, Sparkles, X } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { ChoiceSelect } from "@/components/common/ChoiceSelect"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SessionTextInput } from "@/components/session/SessionTextInput"
import { TopicDefaultSource, TopicSource } from "./TopicSource"

/**
 * Renders the web Source editor's shared state, validation, and recommendations natively.
 */
export function TopicSourceEditor<Attachment>({ fields }: { fields: TopicFields<Attachment> }) {
	const [notice, setNotice] = useState<string | null>(null)
	const editor = useTopicSourceEditor(fields, setNotice)
	return (
		<View className="gap-2">
			<Text className="text-xs text-muted-foreground">default sources</Text>
			{DEFAULT_SOURCES.map((source) => (
				<TopicDefaultSource
					key={source.key}
					label={source.label}
					summary={source.summary}
					isOn={fields.defaultSourceKeys.includes(source.key)}
					onTurnOn={() => editor.handleAddDefaultSource(source.key)}
					onTurnOff={() => editor.handleRemoveDefaultSource(source.key)}
				/>
			))}
			<Text className="mt-2 text-xs text-muted-foreground">custom sources</Text>
			{fields.keptSources.map((source) => (
				<TopicSource
					key={source.id}
					sourceKind={source.sourceKind}
					summary={source.summary}
					screeningMessage={toScreeningMessage(source)}
					onRemoveTopicSource={() =>
						editor.removeSource(() => fields.setKeptSources(fields.keptSources.filter((kept) => kept.id !== source.id)))
					}
				/>
			))}
			{fields.addedSources.map((source) => (
				<TopicSource
					key={`${source.optionKey}:${source.value}`}
					sourceKind={toCustomSourceOption(source.optionKey)?.label ?? source.optionKey}
					summary={toStagedTopicSourceSummary(source)}
					onRemoveTopicSource={() =>
						editor.removeSource(() => fields.setAddedSources(fields.addedSources.filter((kept) => kept !== source)))
					}
				/>
			))}
			{editor.isAdding ? (
				<View className="gap-2">
					<ChoiceSelect
						label="Source type"
						value={editor.newOptionKey}
						options={CUSTOM_SOURCE_OPTIONS.map((source) => ({ value: source.key, label: source.label }))}
						onChange={editor.setNewOptionKey}
					/>
					<SessionTextInput
						label="Source"
						placeholder={editor.newOption?.placeholder}
						value={editor.newValue}
						onChangeText={editor.setNewValue}
						autoCapitalize="none"
					/>
					<View className="flex-row gap-2">
						<Button
							variant="outline"
							accessibilityLabel="Add source"
							disabled={!editor.newValue.trim()}
							onPress={editor.handleAddSource}
						>
							<Text>Add</Text>
						</Button>
						<Button variant="ghost" accessibilityLabel="Cancel adding a source" onPress={editor.handleCancelAdd}>
							<Icon as={X} />
						</Button>
					</View>
				</View>
			) : (
				<View className="flex-row flex-wrap justify-between gap-2">
					<Button
						variant="link"
						className="px-0"
						accessibilityLabel="Add a source"
						disabled={editor.isFull}
						onPress={() => editor.setIsAdding(true)}
					>
						<Icon as={Plus} className="size-4" />
						<Text>add a source</Text>
					</Button>
					<Button
						variant="outline"
						accessibilityLabel="Recommend sources"
						disabled={editor.isFull || !editor.hasTopicWords || editor.isSuggestingSources}
						onPress={() => void editor.handleSuggestSources()}
					>
						<Icon as={Sparkles} className="size-4" />
						<Text>{editor.isSuggestingSources ? "Thinking…" : "Recommend"}</Text>
					</Button>
				</View>
			)}
			{notice && <Text className="text-sm text-muted-foreground">{notice}</Text>}
		</View>
	)
}
