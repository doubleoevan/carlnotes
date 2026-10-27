import { useNow } from "@carlnotes/core/hooks/useNow"
import { ScrollView, View } from "react-native"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { Footer } from "@/components/layout/Footer"
import { Header } from "@/components/layout/Header"
import { SearchBar } from "@/components/search/SearchBar"
import { TopicFeed } from "@/components/topic/TopicFeed"
import { TopicFeedStatus } from "@/components/topic/TopicFeedStatus"
import { TopicHomeActions } from "@/components/topic/TopicHomeActions"
import { TopicPageActions } from "@/components/topic/TopicPageActions"
import { useTopicFeed } from "@/providers/TopicFeedProvider"

/**
 * Shows the signed-in user's feed with shared selection and refresh.
 */
export default function HomeScreen() {
	// tick relative ages once for the list and refresh its shared query
	useNow()
	const topicFeed = useTopicFeed()
	const handleRefresh = (): void => {
		void topicFeed.reheat()
	}
	return (
		<View className="flex-1 bg-background">
			<Header isHome isReheating={topicFeed.isReheating} onReheat={handleRefresh} />
			<ClassNameSafeAreaView edges={["left", "right"]} className="w-full max-w-3xl flex-1 self-center">
				<SearchBar filters={topicFeed} actions={<TopicPageActions onRefresh={handleRefresh} />} />
				<TopicHomeActions filters={topicFeed} knownTags={topicFeed.knownTags} />
				<TopicFeedStatus
					topicLabel="topics"
					isLoading={topicFeed.isLoading}
					hasError={topicFeed.isError}
					hasContent={topicFeed.topicFeed !== null}
					onRetry={handleRefresh}
				/>
				{topicFeed.topicFeed ? (
					<TopicFeed
						key={topicFeed.reheatKey}
						topicFeed={topicFeed.topicFeed}
						state={topicFeed}
						onRefresh={handleRefresh}
					/>
				) : !topicFeed.isLoading ? (
					<ScrollView>
						<Footer />
					</ScrollView>
				) : null}
			</ClassNameSafeAreaView>
		</View>
	)
}
