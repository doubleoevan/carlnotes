import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { TopicFeedState } from "@carlnotes/core/hooks/useTopicFeedState"
import { Text as NativeText, RefreshControl, ScrollView, View } from "react-native"
import { PodcastEpisodePlayerCard } from "@/components/podcast/PodcastEpisodePlayerCard"
import { Badge } from "@/components/primitives/badge"
import { Text } from "@/components/primitives/text"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { CollapsibleSection } from "./CollapsibleSection"
import { TopicByline } from "./Topic"
import { TopicCountsLine } from "./TopicCountsLine"
import { TopicFindingsSection } from "./TopicFindingsSection"
import { TopicInfoButton } from "./TopicInfo"
import { TopicActionBar } from "./TopicPageActions"
import { TopicPageCards } from "./TopicPageCards"

/**
 * Keeps the web Topic page's header, Findings, and cards in one native scroll area.
 */
export function TopicPageContent({
	topic,
	findings,
	state,
	onRefresh,
}: {
	topic: TopicResponse
	findings: TopicFinding[]
	state: Pick<TopicFeedState, "handlers" | "pendingChanges" | "isReheating">
	onRefresh: () => void
}) {
	return (
		<ScrollView
			refreshControl={<RefreshControl refreshing={state.isReheating} onRefresh={onRefresh} />}
			contentContainerStyle={{ paddingBottom: 24 }}
		>
			<TopicActionBar topic={topic} />
			{/* title and byline use the page's own type sizes and insets */}
			<View className="mx-4 mb-3">
				<TopicInfoButton topic={topic}>
					<NativeText
						accessibilityRole="header"
						style={toTypeRoleStyle("pageTitle")}
						className="shrink text-foreground"
					>
						{topic.name}
					</NativeText>
				</TopicInfoButton>
				<TopicByline topic={topic} isPage />
				{topic.tags.length > 0 ? (
					<View className="mt-2 flex-row flex-wrap gap-1">
						{topic.tags.map((tag) => (
							<Badge key={tag} variant="secondary">
								<Text>{tag}</Text>
							</Badge>
						))}
					</View>
				) : null}
			</View>
			{/* full-width cards match the web's narrow reading column */}
			<View className="mx-4">
				<PodcastEpisodePlayerCard topic={topic} topicFeedHandlers={state.handlers} />
				<CollapsibleSection
					title="Topic findings"
					titleAside={
						topic.newCount > 0 ? <Text className="text-sm font-semibold text-badge">{topic.newCount} new</Text> : null
					}
				>
					<TopicFindingsSection topic={topic} findings={findings} state={state} />
				</CollapsibleSection>
			</View>
			<TopicPageCards topic={topic} />
			<TopicCountsLine topic={topic} />
		</ScrollView>
	)
}
