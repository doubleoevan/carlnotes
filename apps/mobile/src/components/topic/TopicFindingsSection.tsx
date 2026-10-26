import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { TopicDetails } from "@carlnotes/contracts/topics"
import type { TopicFeedState } from "@carlnotes/core/hooks/useTopicFeedState"
import { EMPTY_FILTERED_FINDINGS, EMPTY_TOPIC_FINDINGS } from "@carlnotes/core/lib/topicFeedLabels"
import { useMemo, useState } from "react"
import { Text, View } from "react-native"
import { toTopicFindingRows } from "@/topicFeedRows"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { MoreButton } from "./MoreButton"
import { TopicFindingList } from "./TopicFindingList"

// a Topic screen expands its selected findings in place
export type TopicFindingsSectionProps = {
	topic: TopicDetails
	findings: TopicFinding[]
	state: Pick<TopicFeedState, "handlers" | "pendingChanges" | "isReheating">
}

/**
 * Shows the Topic's finding card, expansion controls, and the web's empty-state copy.
 */
export function TopicFindingsSection({ topic, findings, state }: TopicFindingsSectionProps) {
	// retain five-row previews until this topic is expanded
	const [isExpanded, setIsExpanded] = useState(false)
	const findingRows = useMemo(
		() => toTopicFindingRows(isExpanded ? findings : findings.slice(0, 5)),
		[findings, isExpanded],
	)
	return (
		<View className="-mx-4">
			{findingRows.length > 0 ? (
				<TopicFindingList topic={topic} findingRows={findingRows} state={state} />
			) : (
				<Text style={toTypeRoleStyle("body")} className="p-4 text-muted-foreground">
					{topic.lastScanAt ? EMPTY_FILTERED_FINDINGS : EMPTY_TOPIC_FINDINGS}
				</Text>
			)}
			{findings.length > 5 ? (
				<MoreButton
					isExpanded={isExpanded}
					moreCount={findings.length - 5}
					onToggle={() => setIsExpanded(!isExpanded)}
				/>
			) : null}
		</View>
	)
}
