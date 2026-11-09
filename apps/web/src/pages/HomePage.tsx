import { authClient } from "@carlnotes/client/authClient"
import { fetchHome } from "@carlnotes/client/homeClient"
import type {
	HomeResponse,
	PodcastEpisodeCard as PodcastEpisodeCardFields,
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
import { cn } from "@carlnotes/nightshift/classNames"
import { getRouteApi } from "@tanstack/react-router"
import { Fragment, type ReactNode, useEffect, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AccordionSection } from "@/components/common/AccordionSection"
import { Pagination } from "@/components/common/Pagination"
import { HomeHeadline } from "@/components/layout/HomeHeadline"
import { PodcastEpisodeCard } from "@/components/podcast/PodcastEpisodeCard"
import { Accordion } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { Card, CardBody } from "@/components/primitives/card"
import { TopicCard } from "@/components/topic/TopicCard"
import { NewTopicButton, useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { UpdatesList } from "@/components/topic/UpdatesList"
import {
	IMAGE_SKELETON_CLASS,
	PAGE_CLASS,
	RAIL_TEXT_INSET,
	SCRIPTED_HIDDEN_CLASS,
	SECTION_LABEL_CLASS,
} from "@/lib/styleClasses"
import { captureVisitEvent } from "@/lib/visitAnalytics"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { openNewTopicChat } from "@/stores/chatPanelStore"
import { useRegisterPageActions } from "@/stores/pageActionsStore"

// the home route, whose loader holds a visitor's payload from the server
const homeRoute = getRouteApi("/_layout/")

// the classes of a card grid: one column on a phone, two on a tablet, three on a desktop
const CARD_GRID_CLASS = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"

// the home's card sections, all open at first
const HOME_SECTION_VALUES = Object.values(HOME_SECTIONS).map((homeSection) => homeSection.value)

// the three steps of how it works: one column until all three fit in one row, so no step sits alone
const HOW_IT_WORKS_GRID_CLASS = "grid grid-cols-1 gap-4 md:grid-cols-3"

/**
 * Renders the home page's two faces. A visitor sees the featured cards, how it works, and sign in under the header's
 * hero. A user sees the featured cards, their own topics as cards, and the Updates button.
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

	// the home view, reported once the face is known
	useEffect(() => {
		if (!isSessionPending) {
			captureVisitEvent("home_view", { face })
		}
	}, [isSessionPending, face])

	// the search bar's menu has no page options here, and the New Topic button for a user
	useRegisterPageActions({ page: "Home", options: [], hasNewTopicButton: isSignedIn })

	// the New Topic button beside the headline, which sends a visitor to sign up first
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog()
	return (
		<main className={PAGE_CLASS}>
			{/* both faces open with the headline, the page's h1, beside the New Topic button. a visitor reads how it works
			    under it and a user reads their Updates, and a user's own topics follow the featured cards */}
			<div className="flex items-center justify-between gap-3">
				<HomeHeadline />
				<NewTopicButton onNewTopic={openNewTopicDialog} />
			</div>
			{isSignedIn ? <UpdatesSection userId={session?.user.id ?? null} /> : <HowItWorksSection />}
			{/* the card sections in one accordion like the Topics page's, all open at first, or their loading state until a
			    user's read lands. the first header drops its top padding */}
			{home ? (
				<Accordion
					type="multiple"
					defaultValue={HOME_SECTION_VALUES}
					className="mt-4 [&>*:first-child_[data-slot=accordion-trigger]]:pt-0"
				>
					<HomeCardsSection
						section={HOME_SECTIONS.featuredTopics}
						rows={home.featuredTopics}
						renderCard={(topic) => (
							<TopicCard
								topic={topic}
								onOpen={() => captureVisitEvent("featured_card_open", { kind: "topic", id: topic.id })}
							/>
						)}
					/>
					<HomePodcastEpisodesSection
						section={HOME_SECTIONS.featuredPodcastEpisodes}
						podcastEpisodes={home.featuredPodcastEpisodes}
					/>
					<HomePodcastEpisodesSection
						section={HOME_SECTIONS.newestPodcastEpisodes}
						podcastEpisodes={home.newestPodcastEpisodes}
					/>
					{isSignedIn && <YourTopicsSection yourTopics={home.yourTopics ?? null} />}
				</Accordion>
			) : (
				<HomeSkeleton />
			)}
			{newTopicDialog}
		</main>
	)
}

// the home's sections while a user's read is in flight: each header open over one row of cards, as the loaded
// sections draw them, so nothing above them moves when the cards arrive
function HomeSkeleton() {
	return (
		<div aria-hidden="true" className="mt-4">
			{HOME_SECTION_VALUES.map((sectionValue, sectionIndex) => (
				<div key={sectionValue} className="pb-2">
					{/* header: chevron, title, and the count on the right */}
					<div className={cn("flex items-center gap-2 pb-1", sectionIndex > 0 && "pt-4")}>
						<div className="bg-muted size-4 shrink-0 animate-pulse rounded" />
						<div className="bg-muted my-0.5 h-6 w-40 animate-pulse rounded" />
						<div className={cn("bg-muted ml-auto h-4 w-16 animate-pulse rounded", RAIL_TEXT_INSET)} />
					</div>
					{/* one row of cards at every width: one on a phone, two on a tablet, three on a desktop */}
					<div className={CARD_GRID_CLASS}>
						<CardSkeleton />
						<CardSkeleton className="hidden sm:block" />
						<CardSkeleton className="hidden lg:block" />
					</div>
				</div>
			))}
		</div>
	)
}

// one card's loading state: the 3:2 image, then the name and the byline
function CardSkeleton({ className }: { className?: string }) {
	return (
		<Card className={className}>
			<div className={cn(IMAGE_SKELETON_CLASS, "w-full")} />
			<CardBody>
				<div className="bg-muted h-5 w-3/4 animate-pulse rounded" />
				<div className="bg-muted h-3 w-1/2 animate-pulse rounded" />
			</CardBody>
		</Card>
	)
}

// a section of cards in the home's accordion, five to a page, hidden while it has none. without JavaScript every card
// shows and the page buttons stay hidden, so a crawler reads them all
function HomeCardsSection<Row>({
	section,
	rows,
	renderCard,
}: {
	section: HomeCardSection<Row>
	rows: Row[]
	renderCard: (row: Row) => ReactNode
}) {
	const { pagination } = usePagination(rows)

	// the index range of the page shown
	const pageStartIndex = pagination.page * pagination.pageSize
	const pageEndIndex = pageStartIndex + pagination.pageSize
	return (
		<HomeCardsAccordion
			section={section}
			rowCount={rows.length}
			rows={rows}
			pagination={pagination}
			renderCard={(row, index) => (
				<div className={cn("grid", (index < pageStartIndex || index >= pageEndIndex) && SCRIPTED_HIDDEN_CLASS)}>
					{renderCard(row)}
				</div>
			)}
		/>
	)
}

// a card section's header, its cards in the grid, and the page buttons, hidden while the section has no rows
function HomeCardsAccordion<Row>({
	section: { value, title, noun, toRowKey },
	rowCount,
	rows,
	pagination,
	renderCard,
}: {
	section: HomeCardSection<Row>
	rowCount: number
	rows: Row[]
	pagination: PageSelection
	renderCard: (row: Row, index: number) => ReactNode
}) {
	if (rowCount === 0) {
		return null
	}
	return (
		<AccordionSection value={value} title={title} countLabel={toCountLabel(rowCount, noun)} isContentKept>
			<div className={CARD_GRID_CLASS}>
				{rows.map((row, index) => (
					<Fragment key={toRowKey(row)}>{renderCard(row, index)}</Fragment>
				))}
			</div>
			{pagination.pageCount > 1 && (
				<Pagination
					ariaLabel={`${title} pages`}
					pageNumber={pagination.page + 1}
					pageCount={pagination.pageCount}
					onOpenPage={(pageNumber) => pagination.setPage(pageNumber - 1)}
				/>
			)}
		</AccordionSection>
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
		<section aria-label={HOW_IT_WORKS_TITLE} className="mt-3">
			<h2 className={cn(SECTION_LABEL_CLASS, "mb-3")}>{HOW_IT_WORKS_TITLE}</h2>
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

// a user's Updates under the headline: the list at the length the Update button chose, 30 minutes at first
function UpdatesSection({ userId }: { userId: string | null }) {
	const { minutes, setMinutes, updatesQuery, updates, actions } = useHomeUpdates(userId)
	return (
		<div className="mt-3">
			<UpdatesList
				updates={updates}
				topicFeedHandlers={actions.handlers}
				minutes={minutes}
				onSelectMinutes={setMinutes}
				placeholder={
					updatesQuery.isError ? (
						<div className="space-y-3">
							<p className="text-muted-foreground text-sm">{UPDATES_FAILED_TEXT}</p>
							<Button variant="outline" onClick={() => void updatesQuery.refetch()}>
								Try again
							</Button>
						</div>
					) : (
						<CoffeeLoading className="min-h-24 text-base" />
					)
				}
			/>
		</div>
	)
}

// a user's own topics as cards five to a page, or the New Topic button for a user with none once the read lands
function YourTopicsSection({ yourTopics }: { yourTopics: YourTopicsPage | null }) {
	const { pageTopics, pagination } = useYourTopicsPages(yourTopics)
	const { value, title, noun } = HOME_SECTIONS.yourTopics
	if (yourTopics?.totalCount === 0) {
		return (
			<AccordionSection value={value} title={title} countLabel={toCountLabel(0, noun)}>
				<NewTopicButton onNewTopic={openNewTopicChat} />
			</AccordionSection>
		)
	}
	return (
		<HomeCardsAccordion
			section={HOME_SECTIONS.yourTopics}
			rowCount={yourTopics?.totalCount ?? 0}
			rows={pageTopics}
			pagination={pagination}
			renderCard={(topic) => (
				<div className="grid">
					<TopicCard topic={topic} />
				</div>
			)}
		/>
	)
}
