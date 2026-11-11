import { authClient } from "@carlnotes/client/authClient"
import { fetchHome } from "@carlnotes/client/homeClient"
import type {
	HomeResponse,
	PodcastEpisodeCard as PodcastEpisodeCardFields,
	YourTopicsPage,
} from "@carlnotes/contracts/home"
import type { TopicPostCard as TopicPostCardFields } from "@carlnotes/contracts/topicPosts"
import type { TopicPodcastEpisodeVideoDialogSurface } from "@carlnotes/contracts/visitAnalytics"
import { useUpdatesOpener } from "@carlnotes/core/hooks/useUpdatesOpener"
import { useYourTopicsPages } from "@carlnotes/core/hooks/useYourTopicsPages"
import type { CardSection } from "@carlnotes/core/lib/cardSections"
import { EMPTY_HOME, HOME_SECTIONS, HOW_IT_WORKS_STEPS, HOW_IT_WORKS_TITLE } from "@carlnotes/core/lib/homeFaces"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useEffect, useState } from "react"
import { RefreshControl, ScrollView, View } from "react-native"
import { AccordionSection } from "@/components/common/AccordionSection"
import { CardsRowSkeleton, CardsSection, PagedCardsSection } from "@/components/common/CardsSection"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { Footer } from "@/components/layout/Footer"
import { Header } from "@/components/layout/Header"
import { HomeHeadline } from "@/components/layout/HomeHeadline"
import { HomeHero } from "@/components/layout/HomeHero"
import { PodcastEpisodeCard } from "@/components/podcast/PodcastEpisodeCard"
import { Card, CardBody } from "@/components/primitives/card"
import { Text } from "@/components/primitives/text"
import { NewsList } from "@/components/social/NewsList"
import { TopicCard } from "@/components/topic/TopicCard"
import { NewTopicButton } from "@/components/topic/TopicHomeActions"
import { TopicPostCard } from "@/components/topicPost/TopicPostCard"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { captureVisitEvent } from "@/visitAnalytics"

/**
 * The Home screen's two faces, the web's at phone width. A visitor sees the hero, the headline beside New Topic, how
 * it works, and the home topic, film, podcast, and post cards. A user sees the headline beside New Topic, their Brews
 * News card, the home topic, film, podcast, and post cards, and their own topics as cards.
 */
export default function HomeScreen() {
	// whether a user is signed in or a visitor is browsing, and the home payload for that face
	const { data: session, isPending: isSessionPending } = authClient().useSession()
	const isSignedIn = Boolean(session)
	const face = isSignedIn ? "user" : "visitor"
	const homeQuery = useQuery({
		queryKey: ["home", session?.user.id ?? null],
		queryFn: fetchHome,
		enabled: !isSessionPending,
	})
	const home = homeQuery.data ?? EMPTY_HOME
	const handleRefresh = (): void => {
		void homeQuery.refetch()
	}

	// the home view, reported once the face is known
	useEffect(() => {
		if (!isSessionPending) {
			captureVisitEvent("home_view", { face })
		}
	}, [isSessionPending, face])
	return (
		<View className="flex-1 bg-background">
			<Header isHome isHeroShown={!isSignedIn} isReheating={homeQuery.isRefetching} onReheat={handleRefresh} />
			<ClassNameSafeAreaView edges={["left", "right"]} className="w-full max-w-3xl flex-1 self-center">
				<ScrollView
					keyboardShouldPersistTaps="handled"
					contentContainerStyle={{ paddingBottom: 24 }}
					refreshControl={<RefreshControl refreshing={homeQuery.isRefetching} onRefresh={handleRefresh} />}
				>
					{/* both faces open with the headline beside New Topic, under a visitor's hero. a visitor reads how it
					    works under it and a user reads their news, and a user's own topics follow the home topic, film, and
					    podcast cards */}
					{!isSignedIn && <HomeHero />}
					<View className="mx-4 mt-6 flex-row items-center justify-between gap-3">
						<HomeHeadline />
						<NewTopicButton />
					</View>
					{isSignedIn ? <NewsSection userId={session?.user.id ?? null} /> : <HowItWorksSection />}
					{/* the card sections, like the Topics tab's, or the notice when the home read failed */}
					{homeQuery.isError ? (
						<LoadFailedNotice
							className="mx-4 mt-6"
							message="Home didn't load."
							retryLabel="Retry loading home"
							onRetry={handleRefresh}
						/>
					) : homeQuery.isPending ? (
						<HomeCardsSkeleton />
					) : (
						<View className="mt-3">
							<HomeCardSections home={home} />
							{isSignedIn && <YourTopicsSection yourTopics={home.yourTopics} />}
						</View>
					)}
					<Footer />
				</ScrollView>
			</ClassNameSafeAreaView>
		</View>
	)
}

// the sections' values, which key the loading skeleton's sections
const HOME_SECTION_VALUES = Object.values(HOME_SECTIONS).map((homeSection) => homeSection.value)

// a placeholder section never opens or closes
function handleSkeletonToggle(): void {}

// the card sections while the home loads, as the web's home shows them, in the loaded sections' own accordion
// section: each title and count as placeholders over its cards, a full page of them in the first section and one
// card in the others
function HomeCardsSkeleton() {
	return (
		<View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="mt-3">
			<SkeletonPulse>
				{HOME_SECTION_VALUES.map((sectionValue, sectionIndex) => (
					<AccordionSection key={sectionValue} title="" isExpanded isLoading onToggle={handleSkeletonToggle}>
						<CardsRowSkeleton isFullPage={sectionIndex === 0} />
					</AccordionSection>
				))}
			</SkeletonPulse>
		</View>
	)
}

// a section's title in the muted color and its content, in the page's insets
function HomeSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<View className="mx-4 mt-6 gap-3">
			<Text accessibilityRole="header" style={toTypeRoleStyle("sectionTitle")} className="text-muted-foreground">
				{title}
			</Text>
			{children}
		</View>
	)
}

// the home topic cards, the home and new film cards of the week, the home and new podcast episode cards of the week,
// and the home and new Topic Post cards of the week, each in a section that is hidden while it has none
function HomeCardSections({ home }: { home: HomeResponse }) {
	return (
		<>
			<PagedCardsSection
				section={HOME_SECTIONS.homeTopics}
				rows={home.homeTopics}
				renderCard={(topic) => (
					<TopicCard
						topic={topic}
						onOpen={() => captureVisitEvent("home_card_open", { kind: "topic", id: topic.id })}
					/>
				)}
			/>
			{/* the home's and the newest films, right before the home's podcasts, each hidden while it has none */}
			<HomePodcastEpisodesSection
				section={HOME_SECTIONS.homeTopicPodcastEpisodeVideos}
				podcastEpisodes={home.homeTopicPodcastEpisodeVideos ?? []}
				videoSurface="home-videos"
			/>
			<HomePodcastEpisodesSection
				section={HOME_SECTIONS.newestTopicPodcastEpisodeVideos}
				podcastEpisodes={home.newestTopicPodcastEpisodeVideos ?? []}
				videoSurface="newest-videos"
			/>
			<HomePodcastEpisodesSection
				section={HOME_SECTIONS.homePodcastEpisodes}
				podcastEpisodes={home.homePodcastEpisodes}
			/>
			{/* the week's new podcasts, hidden while the week has none */}
			<HomePodcastEpisodesSection
				section={HOME_SECTIONS.newestPodcastEpisodes}
				podcastEpisodes={home.newestPodcastEpisodes}
			/>
			{/* the home's Topic Posts and then the week's new ones, each hidden while it has none */}
			<HomeTopicPostsSection section={HOME_SECTIONS.homeTopicPosts} topicPosts={home.homeTopicPosts} />
			<HomeTopicPostsSection section={HOME_SECTIONS.newestTopicPosts} topicPosts={home.newestTopicPosts ?? []} />
		</>
	)
}

// the home or new podcast episodes as cards, each reporting its open. with a `videoSurface`, they are film cards whose
// play button reports it
function HomePodcastEpisodesSection({
	section,
	podcastEpisodes,
	videoSurface,
}: {
	section: CardSection<PodcastEpisodeCardFields>
	podcastEpisodes: PodcastEpisodeCardFields[]
	videoSurface?: TopicPodcastEpisodeVideoDialogSurface
}) {
	return (
		<PagedCardsSection
			section={section}
			rows={podcastEpisodes}
			renderCard={(podcastEpisodeCard) => (
				<PodcastEpisodeCard
					podcastEpisodeCard={podcastEpisodeCard}
					variant={videoSurface ? "video" : "audio"}
					videoSurface={videoSurface}
					onOpen={() =>
						captureVisitEvent("home_card_open", {
							kind: "podcastEpisode",
							id: podcastEpisodeCard.podcastEpisode.id,
						})
					}
				/>
			)}
		/>
	)
}

// the home or new Topic Posts as cards, each reporting its open
function HomeTopicPostsSection({
	section,
	topicPosts,
}: {
	section: CardSection<TopicPostCardFields>
	topicPosts: TopicPostCardFields[]
}) {
	return (
		<PagedCardsSection
			section={section}
			rows={topicPosts}
			renderCard={(topicPost) => (
				<TopicPostCard
					topicPost={topicPost}
					onOpen={() => captureVisitEvent("home_card_open", { kind: "topicPost", id: topicPost.id })}
				/>
			)}
		/>
	)
}

// how it works in three steps, which a visitor reads between the headline and the home topic and podcast cards
function HowItWorksSection() {
	return (
		<HomeSection title={HOW_IT_WORKS_TITLE}>
			{HOW_IT_WORKS_STEPS.map((step, index) => (
				<Card key={step.title}>
					<CardBody>
						{/* the step's number beside its heading */}
						<View className="flex-row items-baseline gap-2">
							<Text className="font-display text-lg text-muted-foreground">{index + 1}</Text>
							<Text className="font-display text-lg">{step.title}</Text>
						</View>
						<Text className="text-sm text-muted-foreground">{step.text}</Text>
					</CardBody>
				</Card>
			))}
		</HomeSection>
	)
}

// a user's Brews News card under the headline: carl's opener for the day, then their news with its window picker
function NewsSection({ userId }: { userId: string | null }) {
	const opener = useUpdatesOpener(userId)
	return (
		<View className="mx-4 mt-6">
			<NewsList profileUserId={null} userId={userId} opener={opener} />
		</View>
	)
}

// a user's own topics as cards five to a page, or the New Topic button with no count for a user with none once the
// read finishes
function YourTopicsSection({ yourTopics }: { yourTopics: YourTopicsPage | null }) {
	const [isExpanded, setIsExpanded] = useState(true)
	const { pageTopics, pagination } = useYourTopicsPages(yourTopics)
	const { title } = HOME_SECTIONS.yourTopics
	if (yourTopics?.totalCount === 0) {
		return (
			<AccordionSection title={title} isExpanded={isExpanded} onToggle={() => setIsExpanded(!isExpanded)}>
				<View className="mx-4 flex-row pt-2">
					<NewTopicButton />
				</View>
			</AccordionSection>
		)
	}
	return (
		<CardsSection
			section={HOME_SECTIONS.yourTopics}
			rowCount={yourTopics?.totalCount ?? 0}
			rows={pageTopics}
			pagination={pagination}
			isPagedOnServer
			renderCard={(topic) => <TopicCard topic={topic} />}
		/>
	)
}
