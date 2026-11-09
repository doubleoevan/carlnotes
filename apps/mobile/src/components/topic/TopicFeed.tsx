import type { TopicFeedResponse, TopicSectionKey } from "@carlnotes/contracts/topics"
import type { TopicFeedState } from "@carlnotes/core/hooks/useTopicFeedState"
import { toCountLabel } from "@carlnotes/core/lib/labels"
import { TOPIC_SECTION_TITLES } from "@carlnotes/core/lib/topicFeedLabels"
import { FlashList } from "@shopify/flash-list"
import { type ReactElement, useMemo, useState } from "react"
import { Text as NativeText } from "react-native"
import { AccordionSection } from "@/components/common/AccordionSection"
import { Footer } from "@/components/layout/Footer"
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
	listHeader?: ReactElement
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
			ListHeaderComponent={listHeader}
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
				<AccordionSection
					title={TOPIC_SECTION_TITLES[row.sectionKey]}
					countLabel={toCountLabel(row.topicCount, "topic")}
					isExpanded={row.isExpanded}
					onToggle={() => onSectionPress(row.sectionKey)}
				/>
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
				// the toggle starts at the findings card's left edge, inside the card's margin
				<MoreButton
					isExpanded={row.isExpanded}
					moreCount={row.findingCount}
					onToggle={() => onTopicToggle(row.topicKey)}
					className="ml-4"
				/>
			)
	}
}
