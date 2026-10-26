import { authClient } from "@carlnotes/client/authClient"
import { fetchTopicPage } from "@carlnotes/client/topicClient"
import { useNow } from "@carlnotes/core/hooks/useNow"
import { selectTopicFindings } from "@carlnotes/core/lib/topicFeed"
import { applyTopicPageChanges } from "@carlnotes/core/lib/topicFindingChanges"
import { sendTopicViewOnce } from "@carlnotes/core/lib/topicViews"
import { useQuery } from "@tanstack/react-query"
import { useFocusEffect, useLocalSearchParams } from "expo-router"
import { useCallback, useMemo } from "react"
import { Text, View } from "react-native"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { Header } from "@/components/layout/Header"
import { SearchBar } from "@/components/search/SearchBar"
import { TopicFeedStatus } from "@/components/topic/TopicFeedStatus"
import { TopicPageActions } from "@/components/topic/TopicPageActions"
import { TopicPageContent } from "@/components/topic/TopicPageContent"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { selectCachedTopic } from "@/queryCache"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * Reads a topic independently of Home and shows every delivered finding.
 */
export default function TopicScreen() {
	// key each page by account and topic without carrying the previous page's data
	useNow()
	const { topicId } = useLocalSearchParams<{ topicId: string }>()
	const { data: session } = authClient().useSession()
	const topicFeed = useTopicFeed()
	useFocusEffect(useCallback(() => selectCachedTopic(topicId), [topicId]))
	const query = useQuery({
		queryKey: ["topic-page", session?.user.id, topicId],
		queryFn: () => fetchTopicPage(topicId),
		enabled: Boolean(session),
	})
	const page = applyTopicPageChanges(query.data, topicFeed.pendingChanges)
	const topic = page?.status === "visible" ? page.topic : null
	// count a loaded Topic once per app runtime, as the web counts it once per tab
	const loadedTopicId = topic?.id
	useFocusEffect(
		useCallback(() => {
			if (loadedTopicId) {
				sendTopicViewOnce(loadedTopicId)
			}
		}, [loadedTopicId]),
	)
	// reuse the Home preview while loading and the current filters once Findings arrive
	const topicPreview = topicFeed.topicFeed?.sections
		.flatMap((section) => section.topics)
		.find((topic) => topic.id === topicId)
	const findings = useMemo(
		() => (topic ? selectTopicFindings({ ...topicFeed, findings: topic.findings }) : []),
		[topic, topicFeed],
	)
	const handleRefresh = (): void => {
		void topicFeed.reheat(async () => (await query.refetch()).isSuccess)
	}
	return (
		<View className="flex-1 bg-background">
			<Header />
			<ClassNameSafeAreaView edges={["left", "right", "bottom"]} className="w-full max-w-3xl flex-1 self-center">
				<SearchBar
					filters={topicFeed}
					hasTeamBookmarks={topic?.isTeamMember}
					actions={<TopicPageActions topic={topic ?? undefined} onRefresh={handleRefresh} />}
				/>
				<TopicFeedStatus
					topicLabel="topic"
					topicPreview={topicPreview}
					isLoading={query.isPending}
					hasError={query.isError}
					hasContent={topic !== null}
					onRetry={handleRefresh}
				/>
				{topic ? (
					<TopicPageContent
						key={topic.id}
						topic={topic}
						findings={findings}
						state={topicFeed}
						onRefresh={handleRefresh}
					/>
				) : null}
				{page?.status === "gated" ? (
					<Text
						style={toTypeRoleStyle("body")}
						className="p-4 text-muted-foreground"
					>{`You need access to read ${page.topicGate.topicName ?? "this topic"}.`}</Text>
				) : null}
				{page?.status === "missing" ? (
					<Text style={toTypeRoleStyle("body")} className="p-4 text-muted-foreground">
						This topic is unavailable.
					</Text>
				) : null}
			</ClassNameSafeAreaView>
		</View>
	)
}
