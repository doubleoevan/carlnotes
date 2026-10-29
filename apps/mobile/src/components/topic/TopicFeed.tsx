import type { TopicFeedResponse, TopicSectionKey } from "@carlnotes/contracts/topics"
import type { TopicFeedState } from "@carlnotes/core/hooks/useTopicFeedState"
import { TOPIC_SECTION_TITLES } from "@carlnotes/core/lib/topicFeedLabels"
import { FlashList } from "@shopify/flash-list"
import { ChevronDown, ChevronRight } from "lucide-react-native"
import { type ReactNode, useMemo, useState } from "react"
import { Text as NativeText, View } from "react-native"
import { Footer } from "@/components/layout/Footer"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { type TopicFeedRow, toInitialTopicSection, toTopicFeedRows } from "@/topicFeedRows"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { MoreButton } from "./MoreButton"
import { Topic } from "./Topic"
import { TopicFindingList } from "./TopicFindingList"

// the loaded feed resets its open section only after a successful reheat. listHeader scrolls above the first section
export type TopicFeedProps = {
	topicFeed: TopicFeedResponse
	state: Pick<TopicFeedState, "handlers" | "pendingChanges" | "isReheating">
	onRefresh: () => void
	listHeader?: ReactNode
}

/**
 * Renders Home's sections and five-finding previews in one recycled list.
 */
export function TopicFeed({ topicFeed, state, onRefresh, listHeader }: TopicFeedProps) {
	// preserve a user's collapsed section until this feed generation ends
	const [openSection, setOpenSection] = useState<TopicSectionKey | null>(() => toInitialTopicSection(topicFeed))
	const [expandedTopicKeys, setExpandedTopicKeys] = useState<ReadonlySet<string>>(() => new Set())
	const rows = useMemo(
		() => toTopicFeedRows({ topicFeed, openSection, expandedTopicKeys }),
		[topicFeed, openSection, expandedTopicKeys],
	)
	const handleTopicToggle = (topicKey: string): void => {
		setExpandedTopicKeys((currentTopicKeys) => {
			// retain expansion for other topics and recycling passes
			const nextTopicKeys = new Set(currentTopicKeys)
			if (nextTopicKeys.has(topicKey)) {
				nextTopicKeys.delete(topicKey)
			} else {
				nextTopicKeys.add(topicKey)
			}
			return nextTopicKeys
		})
	}
	const handleSectionPress = (sectionKey: TopicSectionKey): void =>
		setOpenSection((currentSection) => (currentSection === sectionKey ? null : sectionKey))
	return (
		<FlashList
			ListHeaderComponent={listHeader ? <>{listHeader}</> : undefined}
			ListFooterComponent={Footer}
			data={rows}
			getItemType={(row) => row.kind}
			keyExtractor={(row) => row.key}
			refreshing={state.isReheating}
			onRefresh={onRefresh}
			contentContainerStyle={{ paddingBottom: 24 }}
			renderItem={({ item }) => (
				<FeedRow row={item} state={state} onSectionPress={handleSectionPress} onTopicToggle={handleTopicToggle} />
			)}
		/>
	)
}

// keep each recycling type free of another row's component state
function FeedRow({
	row,
	state,
	onSectionPress,
	onTopicToggle,
}: {
	row: TopicFeedRow
	state: TopicFeedProps["state"]
	onSectionPress: (sectionKey: TopicSectionKey) => void
	onTopicToggle: (topicKey: string) => void
}) {
	switch (row.kind) {
		case "section":
			return (
				<View className="px-4">
					<Button
						variant="ghost"
						className="min-h-11 justify-start px-0 pt-3 pb-1"
						accessibilityLabel={`${TOPIC_SECTION_TITLES[row.sectionKey]}, ${row.topicCount} topics`}
						accessibilityState={{ expanded: row.isExpanded }}
						onPress={() => onSectionPress(row.sectionKey)}
					>
						<Icon as={row.isExpanded ? ChevronDown : ChevronRight} />
						<Text style={toTypeRoleStyle("logo")} className="flex-1 text-left">
							{TOPIC_SECTION_TITLES[row.sectionKey]}
						</Text>
						<Text className="text-muted-foreground">
							{row.topicCount} {row.topicCount === 1 ? "topic" : "topics"}
						</Text>
					</Button>
				</View>
			)
		case "topic":
			return <Topic topic={row.topic} />
		case "findings":
			return <TopicFindingList topic={row.topic} findingRows={row.findingRows} state={state} />
		case "empty":
			return (
				<NativeText style={toTypeRoleStyle("body")} className="px-4 py-6 text-muted-foreground">
					{row.text}
				</NativeText>
			)
		case "more":
			return (
				<MoreButton
					isExpanded={row.isExpanded}
					moreCount={row.findingCount}
					onToggle={() => onTopicToggle(row.topicKey)}
				/>
			)
	}
}
