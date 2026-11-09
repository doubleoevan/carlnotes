import { authClient } from "@carlnotes/client/authClient"
import { fetchHome } from "@carlnotes/client/homeClient"
import type {
	PodcastEpisodeCard as PodcastEpisodeCardFields,
	TopicCard as TopicCardFields,
	YourTopicsPage,
} from "@carlnotes/contracts/home"
import { UPDATES_FAILED_TEXT } from "@carlnotes/contracts/updates"
import { useHomeUpdates } from "@carlnotes/core/hooks/useHomeUpdates"
import { type PageSelection, usePagination } from "@carlnotes/core/hooks/usePagination"
import { useYourTopicsPages } from "@carlnotes/core/hooks/useYourTopicsPages"
import {
	EMPTY_HOME,
	HOME_SECTIONS,
	HOW_IT_WORKS_STEPS,
	HOW_IT_WORKS_TITLE,
	type HomeCardSection,
} from "@carlnotes/core/lib/homeFaces"
import { toCountLabel } from "@carlnotes/core/lib/labels"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useEffect, useState } from "react"
import { RefreshControl, ScrollView, View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AccordionSection } from "@/components/common/AccordionSection"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { Pagination } from "@/components/common/Pagination"
import { Footer } from "@/components/layout/Footer"
import { Header } from "@/components/layout/Header"
import { HomeHeadline } from "@/components/layout/HomeHeadline"
import { HomeHero } from "@/components/layout/HomeHero"
import { PodcastEpisodeCard } from "@/components/podcast/PodcastEpisodeCard"
import { Card, CardBody } from "@/components/primitives/card"
import { Text } from "@/components/primitives/text"
import { TopicCard } from "@/components/topic/TopicCard"
import { NewTopicButton } from "@/components/topic/TopicHomeActions"
import { UpdatesList } from "@/components/topic/UpdatesList"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { captureVisitEvent } from "@/visitAnalytics"

/**
 * The Home screen's two faces, the web's at phone width. A visitor sees the hero, the headline beside New Topic, how
 * it works, and the featured cards. A user sees the headline beside New Topic, their Updates, the featured cards,
 * and their own topics as cards.
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
					    works under it and a user reads their Updates, and a user's own topics follow the featured cards */}
					{!isSignedIn && <HomeHero />}
					<View className="mx-4 mt-6 flex-row items-center justify-between gap-3">
						<HomeHeadline />
						<NewTopicButton />
					</View>
					{isSignedIn ? <UpdatesSection userId={session?.user.id ?? null} /> : <HowItWorksSection />}
					{/* the card sections, like the Topics tab's, or the notice when the home read failed */}
					{homeQuery.isError ? (
						<LoadFailedNotice
							className="mx-4 mt-6"
							message="Home didn't load."
							retryLabel="Retry loading home"
							onRetry={handleRefresh}
						/>
					) : (
						<View className="mt-3">
							<FeaturedSection
								topics={home.featuredTopics}
								podcastEpisodes={home.featuredPodcastEpisodes}
								newestPodcastEpisodes={home.newestPodcastEpisodes}
							/>
							{isSignedIn && <YourTopicsSection yourTopics={home.yourTopics} />}
						</View>
					)}
					<Footer />
				</ScrollView>
			</ClassNameSafeAreaView>
		</View>
	)
}

// a section's label and its content, in the page's insets
function HomeSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<View className="mx-4 mt-6 gap-3">
			<Text accessibilityRole="header" style={toTypeRoleStyle("sectionLabel")} className="text-muted-foreground">
				{title}
			</Text>
			{children}
		</View>
	)
}

// a section of cards, open at first, five to a page, hidden while it has none, with its count at the far right
function HomeCardsSection<Row>({
	section,
	rows,
	renderCard,
}: {
	section: HomeCardSection<Row>
	rows: Row[]
	renderCard: (row: Row) => ReactNode
}) {
	const { pageRows, pagination } = usePagination(rows)
	return (
		<HomeCardsAccordion
			section={section}
			rowCount={rows.length}
			pageRows={pageRows}
			pagination={pagination}
			renderCard={renderCard}
		/>
	)
}

// one page of a card section's rows under its header, with the page buttons, hidden while the section has no rows
function HomeCardsAccordion<Row>({
	section: { title, noun, toRowKey },
	rowCount,
	pageRows,
	pagination,
	renderCard,
}: {
	section: HomeCardSection<Row>
	rowCount: number
	pageRows: Row[]
	pagination: PageSelection
	renderCard: (row: Row) => ReactNode
}) {
	const [isExpanded, setIsExpanded] = useState(true)
	if (rowCount === 0) {
		return null
	}
	return (
		<AccordionSection
			title={title}
			countLabel={toCountLabel(rowCount, noun)}
			isExpanded={isExpanded}
			onToggle={() => setIsExpanded(!isExpanded)}
		>
			<View className="mx-4 gap-3 pt-2 pb-2">
				{pageRows.map((row) => (
					<View key={toRowKey(row)}>{renderCard(row)}</View>
				))}
				<Pagination
					label={`${title} pages`}
					pageNumber={pagination.page + 1}
					pageCount={pagination.pageCount}
					onOpenPage={(pageNumber) => pagination.setPage(pageNumber - 1)}
				/>
			</View>
		</AccordionSection>
	)
}

// the featured topic cards, the featured podcast episode cards, and the new podcast episode cards of the week, each in
// a section
function FeaturedSection({
	topics,
	podcastEpisodes,
	newestPodcastEpisodes,
}: {
	topics: TopicCardFields[]
	podcastEpisodes: PodcastEpisodeCardFields[]
	newestPodcastEpisodes: PodcastEpisodeCardFields[]
}) {
	return (
		<>
			<HomeCardsSection
				section={HOME_SECTIONS.featuredTopics}
				rows={topics}
				renderCard={(topic) => (
					<TopicCard
						topic={topic}
						onOpen={() => captureVisitEvent("featured_card_open", { kind: "topic", id: topic.id })}
					/>
				)}
			/>
			<HomePodcastEpisodesSection section={HOME_SECTIONS.featuredPodcastEpisodes} podcastEpisodes={podcastEpisodes} />
			<HomePodcastEpisodesSection
				section={HOME_SECTIONS.newestPodcastEpisodes}
				podcastEpisodes={newestPodcastEpisodes}
			/>
		</>
	)
}

// the featured or new podcast episodes as cards, each reporting its open
function HomePodcastEpisodesSection({
	section,
	podcastEpisodes,
}: {
	section: HomeCardSection<PodcastEpisodeCardFields>
	podcastEpisodes: PodcastEpisodeCardFields[]
}) {
	return (
		<HomeCardsSection
			section={section}
			rows={podcastEpisodes}
			renderCard={(podcastEpisodeCard) => (
				<PodcastEpisodeCard
					podcastEpisodeCard={podcastEpisodeCard}
					onOpen={() =>
						captureVisitEvent("featured_card_open", {
							kind: "podcastEpisode",
							id: podcastEpisodeCard.podcastEpisode.id,
						})
					}
				/>
			)}
		/>
	)
}

// how it works in three steps, which a visitor reads between the headline and the featured cards
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

// a user's Updates under the headline: the list at the length the Update button chose, 30 minutes at first
function UpdatesSection({ userId }: { userId: string | null }) {
	const { minutes, setMinutes, updatesQuery, updates, actions } = useHomeUpdates(userId)
	return (
		<View className="mx-4 mt-6">
			<UpdatesList
				updates={updates}
				actions={actions}
				minutes={minutes}
				onSelectMinutes={setMinutes}
				placeholder={
					updatesQuery.isError ? (
						<LoadFailedNotice
							message={UPDATES_FAILED_TEXT}
							retryLabel="Retry updates"
							onRetry={() => void updatesQuery.refetch()}
						/>
					) : (
						<CoffeeLoading className="py-16" />
					)
				}
			/>
		</View>
	)
}

// a user's own topics as cards five to a page, or the New Topic button for a user with none once the read finishes
function YourTopicsSection({ yourTopics }: { yourTopics: YourTopicsPage | null }) {
	const [isExpanded, setIsExpanded] = useState(true)
	const { pageTopics, pagination } = useYourTopicsPages(yourTopics)
	const { title, noun } = HOME_SECTIONS.yourTopics
	if (yourTopics?.totalCount === 0) {
		return (
			<AccordionSection
				title={title}
				countLabel={toCountLabel(0, noun)}
				isExpanded={isExpanded}
				onToggle={() => setIsExpanded(!isExpanded)}
			>
				<View className="mx-4 flex-row pt-2">
					<NewTopicButton />
				</View>
			</AccordionSection>
		)
	}
	return (
		<HomeCardsAccordion
			section={HOME_SECTIONS.yourTopics}
			rowCount={yourTopics?.totalCount ?? 0}
			pageRows={pageTopics}
			pagination={pagination}
			renderCard={(topic) => <TopicCard topic={topic} />}
		/>
	)
}
