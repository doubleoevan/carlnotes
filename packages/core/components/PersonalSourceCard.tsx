import type { PersonalSource } from "@carlnotes/contracts/personalSources"
import type { ComponentType } from "react"
import type { PersonalSourceState } from "../hooks/usePersonalSource"
import type { AiAgentAccountElements } from "./AiAgentAccountCard"
import type { PersonalSourceEntryElements } from "./PersonalSourceEntryList"
import type { TopicSourceProps } from "./TopicSource"

export type PersonalSourceElements = PersonalSourceEntryElements &
	Pick<AiAgentAccountElements, "Confirm"> & { Source: ComponentType<TopicSourceProps> }
type PersonalSourceCardProps = { source: PersonalSource; state: PersonalSourceState; elements: PersonalSourceElements }

/**
 * Shares a plain receiving Source row and its explicit removal control in the editor.
 */
export function PersonalSourceCard({ source, state, elements }: PersonalSourceCardProps) {
	const { Group, Text, Source, Confirm } = elements
	return (
		<Group>
			{/* reuse the ordinary Topic editor's Source row and its platform controls */}
			<Source
				sourceKind={source.label}
				summary={`${source.weekEntryCount} this week · ${source.waitingLinkCount} links waiting`}
				screeningMessage={source.isConnected ? null : "disconnected"}
				onRemoveTopicSource={state.removeSource}
			/>
			{!source.isConnected && (
				<Text className="text-sm text-muted-foreground">
					Receiving is unavailable for this Source. Saved entries remain available until deletion.
				</Text>
			)}
			{state.error && <Text className="text-destructive">{state.error}</Text>}
			{state.confirmation && (
				<Confirm
					title={`Delete ${state.confirmation.title}?`}
					confirmLabel="Delete Source and entries"
					cancelLabel="Cancel"
					onConfirm={state.confirm}
					onClose={state.cancel}
				>
					This deletes your Source, its items, and waiting links. Carl rebuilds your private summary and removes
					annotations based on the deleted items. Existing Findings remain.
				</Confirm>
			)}
		</Group>
	)
}
