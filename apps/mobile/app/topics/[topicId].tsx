import { authClient } from "@carlnotes/client/authClient"
import { type FetchTopicPageOptions, fetchTopicPage, type TopicPageResult } from "@carlnotes/client/topicClient"
import { useNow } from "@carlnotes/core/hooks/useNow"
import { sendTopicViewOnce } from "@carlnotes/core/lib/pageViews"
import { toPolledTopicPageResult } from "@carlnotes/core/lib/scanPoll"
import { selectTopicFindings } from "@carlnotes/core/lib/topicFeed"
import { applyTopicPageChanges } from "@carlnotes/core/lib/topicFindingChanges"
import { useTopicChangeCount } from "@carlnotes/core/stores/chatConversationStore"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useFocusEffect, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useMemo } from "react"
import { ScrollView, Text, View } from "react-native"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { Footer } from "@/components/layout/Footer"
import { Header } from "@/components/layout/Header"
import { SearchBar } from "@/components/search/SearchBar"
import { TopicFeedStatus } from "@/components/topic/TopicFeedStatus"
import { TopicGateNotice } from "@/components/topic/TopicGateNotice"
import { TopicLinkedFinding } from "@/components/topic/TopicLinkedFinding"
import { TopicPageActions } from "@/components/topic/TopicPageActions"
import { TopicPageContent } from "@/components/topic/TopicPageContent"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { selectCachedTopic } from "@/queryCache"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { captureVisitEvent, toPublicTopicProperties } from "@/visitAnalytics"

/**
 * Reads a topic independently of Home and shows every delivered finding.
 */
export default function TopicScreen() {
	// key the query by account and topic and clear data from the previous topic
	useNow()
	const { topicId } = useLocalSearchParams<{ topicId: string }>()
	const { data: session } = authClient().useSession()
	const topicFeed = useTopicFeed()
	useFocusEffect(useCallback(() => selectCachedTopic(topicId), [topicId]))
	const queryClient = useQueryClient()
	const topicPageKey = ["topic-page", session?.user.id ?? null, topicId]
	const query = useQuery({ queryKey: topicPageKey, queryFn: () => fetchTopicPage(topicId) })
	// refresh the mounted Topic after accepted chat edits
	const topicChangeCount = useTopicChangeCount(topicId)
	const { refetch } = query
	useEffect(() => {
		if (topicChangeCount > 0) {
			void refetch()
		}
	}, [topicChangeCount, refetch])
	const page = applyTopicPageChanges(query.data, topicFeed.pendingChanges)
	const topic = page?.status === "visible" ? page.topic : null
	const isLoadingTopic = !topic && query.isPending && query.fetchStatus !== "paused"
	// count a loaded Topic once per app runtime, as the web counts it once per tab
	const loadedTopicId = topic?.id
	const loadedTopicVisibility = topic?.visibility
	useFocusEffect(
		useCallback(() => {
			if (loadedTopicId && loadedTopicVisibility) {
				captureVisitEvent(
					"visit_topic_viewed",
					toPublicTopicProperties({ id: loadedTopicId, visibility: loadedTopicVisibility }),
				)
				sendTopicViewOnce(loadedTopicId)
			}
		}, [loadedTopicId, loadedTopicVisibility]),
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
	const handleScanned = async ({ isPoll = false }: FetchTopicPageOptions = {}): Promise<void> => {
		if (!isPoll) {
			await query.refetch({ cancelRefetch: false })
			return
		}

		// a poll leaves out the related topics, the reactions, and the comment thread, so the page keeps its own
		const polledTopicPage = await fetchTopicPage(topicId, { isPoll })
		queryClient.setQueryData<TopicPageResult>(topicPageKey, (topicPage) =>
			toPolledTopicPageResult(topicPage, polledTopicPage),
		)
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
				{topic && <TopicLinkedFinding topic={topic} />}
				{topic ? (
					<TopicPageContent
						key={topic.id}
						topic={topic}
						findings={findings}
						state={topicFeed}
						onRefresh={handleRefresh}
						onScanned={handleScanned}
					/>
				) : null}
				{page?.status === "gated" ? (
					<TopicGateNotice isSignedIn={Boolean(session)} returnPath={`/topics/${topicId}`} />
				) : null}
				{page?.status === "missing" ? (
					<Text style={toTypeRoleStyle("body")} className="p-4 text-muted-foreground">
						This topic is unavailable.
					</Text>
				) : null}
				{!topic && !isLoadingTopic && (
					<ScrollView>
						<Footer />
					</ScrollView>
				)}
			</ClassNameSafeAreaView>
		</View>
	)
}
