import { authClient } from "@carlnotes/client/authClient"
import { useNow } from "@carlnotes/core/hooks/useNow"
import { isUserTopicFeedEmpty } from "@carlnotes/core/lib/topicFeed"
import { router } from "expo-router"
import { Coffee } from "lucide-react-native"
import { useEffect } from "react"
import { ScrollView, View } from "react-native"
import { toNewTopicChatHref } from "@/components/chat/chatNavigation"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { Footer } from "@/components/layout/Footer"
import { Header } from "@/components/layout/Header"
import { HomeHero } from "@/components/layout/HomeHero"
import { PageActionMenu } from "@/components/search/PageActionMenu"
import { SearchBar } from "@/components/search/SearchBar"
import { TopicFeed } from "@/components/topic/TopicFeed"
import { TopicFeedStatus } from "@/components/topic/TopicFeedStatus"
import { TopicHomeActions } from "@/components/topic/TopicHomeActions"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { takeNewTopicChatWelcome } from "@/stores/newTopicChatWelcome"

/**
 * Shows the current account's feed or the public feed with shared selection and refresh.
 */
export default function HomeScreen() {
	// tick relative ages once for the list and refresh its shared query
	useNow()
	const topicFeed = useTopicFeed()
	const handleRefresh = (): void => {
		void topicFeed.reheat()
	}

	// read the session. a signed-in user's empty Feed opens the new-topic chat by itself, once per launch
	const { data: session } = authClient().useSession()
	const isTopicFeedEmpty = Boolean(session) && isUserTopicFeedEmpty(topicFeed.topicFeed)
	useEffect(() => {
		if (isTopicFeedEmpty && takeNewTopicChatWelcome()) {
			router.push(toNewTopicChatHref())
		}
	}, [isTopicFeedEmpty])

	// a visitor's Home shows the web hero, which scrolls with the search bar and the tags as the
	// phone web's does. a user's search bar and tags stay pinned under the brand row
	const isHeroShown = !session
	const homeTop = (
		<>
			{isHeroShown && <HomeHero />}
			<SearchBar
				filters={topicFeed}
				actions={
					<PageActionMenu
						page="Home"
						hasNewTopicButton
						options={[{ label: "Reheat", icon: Coffee, onSelect: handleRefresh }]}
					/>
				}
			/>
			<TopicHomeActions filters={topicFeed} knownTags={topicFeed.knownTags} />
			<TopicFeedStatus
				topicLabel="topics"
				isLoading={topicFeed.isLoading}
				hasError={topicFeed.isError}
				hasContent={topicFeed.topicFeed !== null}
				onRetry={handleRefresh}
			/>
		</>
	)
	return (
		<View className="flex-1 bg-background">
			<Header isHome isHeroShown={isHeroShown} isReheating={topicFeed.isReheating} onReheat={handleRefresh} />
			<ClassNameSafeAreaView edges={["left", "right"]} className="w-full max-w-3xl flex-1 self-center">
				{!isHeroShown && homeTop}
				{topicFeed.topicFeed ? (
					<TopicFeed
						key={topicFeed.reheatKey}
						topicFeed={topicFeed.topicFeed}
						state={topicFeed}
						onRefresh={handleRefresh}
						listHeader={isHeroShown ? homeTop : undefined}
					/>
				) : (
					<ScrollView keyboardShouldPersistTaps="handled">
						{isHeroShown && homeTop}
						{!topicFeed.isLoading && <Footer />}
					</ScrollView>
				)}
			</ClassNameSafeAreaView>
		</View>
	)
}
