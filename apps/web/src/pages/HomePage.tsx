import { authClient } from "@carlnotes/client/authClient"
import { fetchHome } from "@carlnotes/client/homeClient"
import { isAdminRole } from "@carlnotes/contracts/enums"
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
import { HOME_RANK_OPTION_LABELS } from "@carlnotes/core/lib/rankDialog"
import { cn } from "@carlnotes/nightshift/classNames"
import { getRouteApi } from "@tanstack/react-router"
import { NotebookPen } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { AccordionSection } from "@/components/common/AccordionSection"
import { CardsRowSkeleton, CardsSection, PagedCardsSection } from "@/components/common/CardsSection"
import { HomeHeadline } from "@/components/layout/HomeHeadline"
import { PodcastEpisodeCard } from "@/components/podcast/PodcastEpisodeCard"
import { Accordion } from "@/components/primitives/accordion"
import { NewsList } from "@/components/social/NewsList"
import { TopicCard } from "@/components/topic/TopicCard"
import { NewTopicButton, useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { HomeTopicPostRankDialog } from "@/components/topicPost/HomeTopicPostRankDialog"
import { TopicPostCard } from "@/components/topicPost/TopicPostCard"
import { FLUSH_FIRST_SECTION_CLASS, PAGE_CLASS } from "@/lib/styleClasses"
import { captureVisitEvent } from "@/lib/visitAnalytics"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { openNewTopicChat } from "@/stores/chatPanelStore"
import { useRegisterPageActions } from "@/stores/pageActionsStore"

// the home route, whose loader holds a visitor's payload from the server
const homeRoute = getRouteApi("/_layout/")

// the home's card sections, all open at first
const HOME_SECTION_VALUES = Object.values(HOME_SECTIONS).map((homeSection) => homeSection.value)

// the classes of the accordion of card sections, loaded or loading: the gap under the news, and a first title with no
// top padding
const HOME_ACCORDION_CLASS = cn("mt-3", FLUSH_FIRST_SECTION_CLASS)

// the three steps of how it works: one column until all three fit in one row, so no step sits alone
const HOW_IT_WORKS_GRID_CLASS = "grid grid-cols-1 gap-4 md:grid-cols-3"

/**
 * Renders the home page's two faces. A visitor sees the home topic, film, podcast, and post cards, how it works, and
 * sign in under the header's hero. A user sees the Brews News card, the home topic, film, podcast, and post cards, and
 * their own topics as cards.
 */
export function HomePage() {
	// whether a user is signed in or a visitor is browsing
	const { data: session, isPending: isSessionPending } = authClient().useSession()
	const isSignedIn = Boolean(session)
	const face = isSignedIn ? "user" : "visitor"

	// a visitor's payload from the server, and a user's read in the browser once their session is known
	const serverHome = homeRoute.useLoaderData()
	const [home, setHome] = useState<HomeResponse | null>(serverHome)
	const hasServerHome = serverHome !== null
	const { reheatKey } = useTopicFeed()
	useEffect(() => {
		// a visitor keeps the server's payload until the home logo's reheat
		if (isSessionPending || (!isSignedIn && hasServerHome && reheatKey === 0)) {
			return
		}
		let isCurrent = true
		fetchHome()
			.then((loadedHome) => isCurrent && setHome(loadedHome))
			.catch(() => isCurrent && setHome((currentHome) => currentHome ?? EMPTY_HOME))
		return () => {
			isCurrent = false
		}
	}, [isSessionPending, isSignedIn, hasServerHome, reheatKey])

	// read the home again after an admin's change to its pinned posts. a failed read keeps the cards shown
	const handleReloadHome = useCallback((): void => {
		fetchHome()
			.then(setHome)
			.catch((error) => console.error("home reload failed", error))
	}, [])

	// the home view, reported once the face is known
	useEffect(() => {
		if (!isSessionPending) {
			captureVisitEvent("home_view", { face })
		}
	}, [isSessionPending, face])

	// the search bar's menu offers an admin the home's pinned posts, and the New Topic button for a user
	const [isRankingTopicPosts, setIsRankingTopicPosts] = useState(false)
	useRegisterPageActions({
		page: "Home",
		options: isAdminRole(session?.user.role)
			? [{ label: HOME_RANK_OPTION_LABELS.posts, Icon: NotebookPen, onSelect: () => setIsRankingTopicPosts(true) }]
			: [],
		hasNewTopicButton: isSignedIn,
	})

	// the New Topic button beside the headline, which sends a visitor to sign up first
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog()
	return (
		<main className={PAGE_CLASS}>
			{/* both faces open with the headline, the page's h1, beside the New Topic button. a visitor reads how it works
			    under it and a user reads their news, and a user's own topics follow the home topic, film, and podcast
			    cards */}
			<div className="flex items-center justify-between gap-3">
				<HomeHeadline />
				<NewTopicButton onNewTopic={openNewTopicDialog} />
			</div>
			{isSignedIn ? <NewsSection userId={session?.user.id ?? null} /> : <HowItWorksSection />}
			{/* the card sections in one accordion like the Topics page's, all open at first, or their loading state until a
			    user's read lands. the first header drops its top padding, so the gap under the news equals the gap over it */}
			{home ? (
				<Accordion type="multiple" defaultValue={HOME_SECTION_VALUES} className={HOME_ACCORDION_CLASS}>
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
					{isSignedIn && <YourTopicsSection yourTopics={home.yourTopics ?? null} />}
				</Accordion>
			) : (
				<HomeSkeleton />
			)}
			{/* an admin's list of the home's pinned posts, with the ones they may still pin */}
			{isRankingTopicPosts && (
				<HomeTopicPostRankDialog onSaved={handleReloadHome} onClose={() => setIsRankingTopicPosts(false)} />
			)}
			{newTopicDialog}
		</main>
	)
}

// the home's sections while a user's read is in flight, in the loaded sections' own accordion: each title and count
// as placeholders over its cards, a full page of them in the first section and one row in the others, so nothing above
// them moves when the cards arrive
function HomeSkeleton() {
	return (
		<Accordion aria-hidden="true" type="multiple" value={HOME_SECTION_VALUES} className={HOME_ACCORDION_CLASS}>
			{HOME_SECTION_VALUES.map((sectionValue, sectionIndex) => (
				<AccordionSection key={sectionValue} value={sectionValue} title="" isLoading>
					<CardsRowSkeleton isFullPage={sectionIndex === 0} />
				</AccordionSection>
			))}
		</Accordion>
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
		<section aria-label={HOW_IT_WORKS_TITLE} className="mt-3">
			{/* the title at a section title's size, in the muted color */}
			<h2 className="font-display text-muted-foreground mb-3 text-xl">{HOW_IT_WORKS_TITLE}</h2>
			<ol className={HOW_IT_WORKS_GRID_CLASS}>
				{HOW_IT_WORKS_STEPS.map((step, index) => (
					<li key={step.title} className="bg-card border-separator shadow-raised rounded-lg border p-4">
						{/* the step's number beside its heading */}
						<span className="font-display flex items-baseline gap-2 text-lg">
							<span className="text-muted-foreground">{index + 1}</span>
							<span>{step.title}</span>
						</span>
						<span className="text-muted-foreground block text-sm">{step.text}</span>
					</li>
				))}
			</ol>
		</section>
	)
}

// a user's Brews News card under the headline: carl's opener for the day, then their news with its window picker
function NewsSection({ userId }: { userId: string | null }) {
	const opener = useUpdatesOpener(userId)
	return (
		<div className="mt-3">
			<NewsList profileUserId={null} userId={userId} opener={opener} />
		</div>
	)
}

// a user's own topics as cards five to a page, or the New Topic button with no count for a user with none once the
// read lands
function YourTopicsSection({ yourTopics }: { yourTopics: YourTopicsPage | null }) {
	const { pageTopics, pagination } = useYourTopicsPages(yourTopics)
	const { value, title } = HOME_SECTIONS.yourTopics
	if (yourTopics?.totalCount === 0) {
		return (
			<AccordionSection value={value} title={title}>
				<NewTopicButton onNewTopic={openNewTopicChat} />
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
