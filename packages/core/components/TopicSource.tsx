import type { ComponentType, PropsWithChildren } from "react"

// the source editor's data and platform controls
export type TopicSourceProps = {
	sourceKind: string
	summary: string
	screeningMessage?: string | null
	onRemoveTopicSource: () => void
}
export type TopicDefaultSourceProps = {
	label: string
	summary: string
	isOn: boolean
	onTurnOn: () => void
	onTurnOff: () => void
}
export type TopicSourceElements = {
	Row: ComponentType<PropsWithChildren>
	Kind: ComponentType<{ sourceKind: string }>
	Summary: ComponentType<PropsWithChildren<Pick<TopicSourceProps, "summary">>>
	Remove: ComponentType<{ label: string; onPress: () => void }>
	Add: ComponentType<{ label: string; onPress: () => void }>
}

/**
 * Shows a default Source as an editable row while enabled and an add button while disabled.
 */
export function TopicDefaultSource({
	label,
	summary,
	isOn,
	onTurnOn,
	onTurnOff,
	elements,
}: TopicDefaultSourceProps & { elements: TopicSourceElements }) {
	if (!isOn) {
		return <elements.Add label={`+ ${label}`} onPress={onTurnOn} />
	}
	return <TopicSource sourceKind={label} summary={summary} onRemoveTopicSource={onTurnOff} elements={elements} />
}

/**
 * Composes the Source label, summary, and removal control shared by both editors.
 */
export function TopicSource({
	sourceKind,
	summary,
	screeningMessage,
	onRemoveTopicSource,
	elements: { Row, Kind, Summary, Remove },
}: TopicSourceProps & { elements: TopicSourceElements }) {
	return (
		<Row>
			{/* source label */}
			<Kind sourceKind={sourceKind} />
			{/* summary and screening status */}
			<Summary summary={summary}>
				{summary || "—"}
				{screeningMessage ? ` · ${screeningMessage}` : ""}
			</Summary>
			{/* removal control */}
			<Remove label={`Remove ${sourceKind} source`} onPress={onRemoveTopicSource} />
		</Row>
	)
}
