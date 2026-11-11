import { fetchSeasonPodcastEpisodes } from "@carlnotes/client/podcastEpisodeClient"
import type { SeasonPodcastEpisodes } from "@carlnotes/contracts/podcast"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	FILM_SEASON_KEY,
	PODCAST_EPISODE_SEASON_KEY,
	type PodcastEpisodesCardElements,
	PodcastEpisodesCard as SharedPodcastEpisodesCard,
	toShownPodcastEpisodeId,
	toShownPodcastSeason,
} from "@carlnotes/core/components/PodcastEpisodesCard"
import {
	playInTopicPodcastEpisodeVideoSection,
	type TopicPodcastEpisodeVideoSection,
	useTopicPodcastEpisodeVideoSection,
} from "@carlnotes/core/stores/topicPodcastEpisodeVideoSectionStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { useMatch } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Pagination } from "@/components/common/Pagination"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { useSearchParams } from "@/hooks/useSearchParams"
import { toRenderedRows } from "@/lib/renderedRows"
import { RESOURCE_LIST_CARD_CLASS } from "@/lib/styleClasses"
import { captureFilmVisitEvent } from "@/lib/visitAnalytics"
import { usePodcastEpisodePlayer } from "@/stores/podcastEpisodePlayerStore"
import { PodcastEpisodeRow } from "./PodcastEpisodeRow"
import { RemovePodcastEpisodeDialog } from "./RemovePodcastEpisodeDialog"

// retain browser loading, SSR links, and no-JavaScript rows around the shared list composition
const EMPTY_SEASON_PODCAST_EPISODES: SeasonPodcastEpisodes = { podcastEpisodes: [] }
const elements: PodcastEpisodesCardElements = {
	// the title is long, so its count shows only where a wide screen leaves it room
	Section: ({ title, countLabel, children }) => (
		<CollapsibleSection
			value="episodes"
			title={title}
			countLabel={countLabel}
			isCountHiddenOnNarrowScreens
			hasStackedClosedDivider
		>
			{children}
		</CollapsibleSection>
	),
	Card: ({ children }) => <div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1")}>{children}</div>,
	Tabs: ({ children }) => (
		<nav aria-label="Seasons" className="flex gap-1 px-2">
			{children}
		</nav>
	),
	Tab: ({ season, topicPath, search, className, isSelected, onPress }) => (
		<AnchorLink
			href={`${topicPath}${search}`}
			onClick={onPress}
			replace
			resetScroll={false}
			aria-current={isSelected ? "page" : undefined}
			className={className}
		>
			{season}
		</AnchorLink>
	),
	Loading: () => <CoffeeLoading className="min-h-80 text-base sm:min-h-70" />,
	List: ({ children, label, isLoading }) => (
		<ol aria-label={label} className={cn(isLoading && "hidden")}>
			{children}
		</ol>
	),
	Row: PodcastEpisodeRow,
	Pagination: ({ label, ...props }) => <Pagination ariaLabel={label} {...props} />,
	Remove: RemovePodcastEpisodeDialog,
}

// Coffee Break films opens and closes apart from Coffee Break podcast episodes. its title is short, so its count shows
// at every width
const filmElements: PodcastEpisodesCardElements = {
	...elements,
	Section: ({ title, countLabel, children }) => (
		<CollapsibleSection value="films" title={title} countLabel={countLabel} hasStackedClosedDivider>
			{children}
		</CollapsibleSection>
	),
}

// Coffee Break podcast episodes with the reload after a removal, or Coffee Break films
type PodcastEpisodesCardProps =
	| { topic: TopicResponse; format?: "audio"; onPodcastEpisodeRemoved: () => Promise<void> }
	| { topic: TopicResponse; format: "video" }

/**
 * Adapts shared season cards to browser routing and server-provided season data, as Coffee Break podcast episodes or
 * as Coffee Break films. A topic without a film shows no Coffee Break films.
 */
export function PodcastEpisodesCard(props: PodcastEpisodesCardProps) {
	if (props.format !== "video") {
		return <PodcastEpisodeList topic={props.topic} onPodcastEpisodeRemoved={props.onPodcastEpisodeRemoved} />
	}
	const topicPodcastEpisodeVideoSection = props.topic.podcast?.topicPodcastEpisodeVideoSection
	if (!topicPodcastEpisodeVideoSection) {
		return null
	}
	return <FilmList topic={props.topic} topicPodcastEpisodeVideoSection={topicPodcastEpisodeVideoSection} />
}

// Coffee Break podcast episodes, with removal for a permitted user
function PodcastEpisodeList({
	topic,
	onPodcastEpisodeRemoved,
}: {
	topic: TopicResponse
	onPodcastEpisodeRemoved: () => Promise<void>
}) {
	// retain loaded, linked, and latest selection and the browser's existing season loader
	const { podcastEpisode } = usePodcastEpisodePlayer()
	const searchParams = useSearchParams()
	const shownSeason = toShownPodcastSeason(topic.podcast?.seasons ?? [], searchParams.get(PODCAST_EPISODE_SEASON_KEY))
	const { seasonPodcastEpisodes, isSeasonLoading, loadSeasonPodcastEpisodes } = useSeasonPodcastEpisodes({
		topic,
		shownSeason,
		hasVideo: false,
	})
	return (
		<SharedPodcastEpisodesCard
			topic={topic}
			shownSeason={shownSeason}
			episodes={seasonPodcastEpisodes.podcastEpisodes}
			isLoading={isSeasonLoading}
			search={searchParams.toString()}
			selectedEpisodeId={toShownPodcastEpisodeId({
				topic,
				loadedPodcastEpisode: podcastEpisode,
				linkedPodcastEpisodeId: searchParams.get("episode"),
			})}
			onOpenSeason={() => {}}
			onReload={loadSeasonPodcastEpisodes}
			onRemoved={onPodcastEpisodeRemoved}
			renderRows={toRenderedRows}
			elements={elements}
		/>
	)
}

// Coffee Break films, whose row plays its film in Topic Cinema and marks the film that Topic Cinema shows
function FilmList({
	topic,
	topicPodcastEpisodeVideoSection,
}: {
	topic: TopicResponse
	topicPodcastEpisodeVideoSection: TopicPodcastEpisodeVideoSection
}) {
	// the film season shown, its films, and the film in Topic Cinema
	const searchParams = useSearchParams()
	const shownSeason = toShownPodcastSeason(topic.podcast?.seasons ?? [], searchParams.get(FILM_SEASON_KEY))
	const { seasonPodcastEpisodes, isSeasonLoading, loadSeasonPodcastEpisodes } = useSeasonPodcastEpisodes({
		topic,
		shownSeason,
		hasVideo: true,
	})
	const { podcastEpisode: shownFilm } = useTopicPodcastEpisodeVideoSection(topic.id, topicPodcastEpisodeVideoSection)
	return (
		<SharedPodcastEpisodesCard
			topic={topic}
			shownSeason={shownSeason}
			episodes={seasonPodcastEpisodes.podcastEpisodes}
			isLoading={isSeasonLoading}
			search={searchParams.toString()}
			selectedEpisodeId={shownFilm.id}
			onOpenSeason={() => {}}
			onReload={loadSeasonPodcastEpisodes}
			onRemoved={async () => {}}
			renderRows={toRenderedRows}
			onPageView={({ season, page }) =>
				captureFilmVisitEvent("visit_episode_videos_page_viewed", { topicId: topic.id, season, page })
			}
			filmList={{
				latestFilmPodcastEpisodeId: topicPodcastEpisodeVideoSection.podcastEpisode.id,
				onPlayFilm: (podcastEpisode) => playInTopicPodcastEpisodeVideoSection(topic.id, podcastEpisode),
			}}
			elements={filmElements}
		/>
	)
}

// the topic, the season shown, and whether to read only the podcast episodes with a film
type UseSeasonPodcastEpisodesOptions = { topic: TopicResponse; shownSeason: number | undefined; hasVideo: boolean }

// the shown season's podcast episodes, whether an older season is loading,
// and the call that loads an older season again. the latest season's episodes arrive with the topic page
function useSeasonPodcastEpisodes({ topic, shownSeason, hasVideo }: UseSeasonPodcastEpisodesOptions): {
	seasonPodcastEpisodes: SeasonPodcastEpisodes
	isSeasonLoading: boolean
	loadSeasonPodcastEpisodes: () => Promise<void>
} {
	// the season that the server fetched for a url that names a season
	const loadedSeason = useMatch({
		from: "/_layout/topics/$topicId_/$topicSlug",
		shouldThrow: false,
		select: (topicMatch) =>
			hasVideo ? topicMatch.loaderData?.fetchedFilmSeason : topicMatch.loaderData?.fetchedSeason,
	})

	// whether the latest season is shown, and the fetched older seasons by number, starting with the server's
	const isLatestSeason = shownSeason === topic.podcast?.seasons[0]
	const [fetchedSeasons, setFetchedSeasons] = useState<Map<number, SeasonPodcastEpisodes>>(
		() => new Map(loadedSeason ? [[loadedSeason.season, loadedSeason.seasonPodcastEpisodes]] : []),
	)
	const shownFetchedSeasonPodcastEpisodes = shownSeason === undefined ? undefined : fetchedSeasons.get(shownSeason)

	// fetch the season shown if the season shown is an older season, and keep it under its own number
	const loadSeasonPodcastEpisodes = useCallback(async (): Promise<void> => {
		if (shownSeason === undefined || isLatestSeason) {
			return
		}
		const seasonPodcastEpisodes = await fetchSeasonPodcastEpisodes({ topicId: topic.id, season: shownSeason, hasVideo })
		setFetchedSeasons((previousFetchedSeasons) =>
			new Map(previousFetchedSeasons).set(shownSeason, seasonPodcastEpisodes),
		)
	}, [topic.id, shownSeason, isLatestSeason, hasVideo])
	useEffect(() => {
		void loadSeasonPodcastEpisodes()
	}, [loadSeasonPodcastEpisodes])

	// return the latest season's podcast episodes from the topic page, or the older season's episodes once loaded.
	// the films list keeps the latest season's podcast episodes with a film
	if (isLatestSeason) {
		const latestSeasonPodcastEpisodes = topic.podcast?.latestSeasonPodcastEpisodes ?? EMPTY_SEASON_PODCAST_EPISODES
		const shownLatestSeasonPodcastEpisodes = hasVideo
			? {
					podcastEpisodes: latestSeasonPodcastEpisodes.podcastEpisodes.filter((podcastEpisode) => podcastEpisode.video),
				}
			: latestSeasonPodcastEpisodes
		return {
			seasonPodcastEpisodes: shownLatestSeasonPodcastEpisodes,
			isSeasonLoading: false,
			loadSeasonPodcastEpisodes,
		}
	}
	const seasonPodcastEpisodes = shownFetchedSeasonPodcastEpisodes ?? EMPTY_SEASON_PODCAST_EPISODES
	return { seasonPodcastEpisodes, isSeasonLoading: !shownFetchedSeasonPodcastEpisodes, loadSeasonPodcastEpisodes }
}
