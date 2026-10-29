import { fetchSeasonPodcastEpisodes } from "@carlnotes/client/podcastEpisodeClient"
import type { SeasonPodcastEpisodes } from "@carlnotes/contracts/podcast"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	type PodcastEpisodesCardElements,
	PodcastEpisodesCard as SharedPodcastEpisodesCard,
	toShownPodcastEpisodeId,
	toShownPodcastSeason,
} from "@carlnotes/core/components/PodcastEpisodesCard"
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
import { usePodcastEpisodePlayer } from "@/stores/podcastEpisodePlayerStore"
import { PodcastEpisodeRow } from "./PodcastEpisodeRow"
import { RemovePodcastEpisodeDialog } from "./RemovePodcastEpisodeDialog"

// retain browser loading, SSR links, and no-JavaScript rows around the shared list composition
const EMPTY_SEASON_PODCAST_EPISODES: SeasonPodcastEpisodes = { podcastEpisodes: [] }
const elements: PodcastEpisodesCardElements = {
	Section: ({ title, children }) => (
		<CollapsibleSection value="episodes" title={title}>
			{children}
		</CollapsibleSection>
	),
	Card: ({ children }) => <div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1")}>{children}</div>,
	Tabs: ({ children }) => (
		<nav aria-label="Seasons" className="flex gap-1 px-2">
			{children}
		</nav>
	),
	Tab: ({ season, topicPath, search, className, isSelected }) => (
		<AnchorLink
			href={`${topicPath}${search}`}
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

/**
 * Adapts shared season cards to browser routing and server-provided season data.
 */
export function PodcastEpisodesCard({
	topic,
	onPodcastEpisodeRemoved,
}: {
	topic: TopicResponse
	onPodcastEpisodeRemoved: () => Promise<void>
}) {
	// retain loaded, linked, and latest selection and the browser's existing season loader
	const { podcastEpisode } = usePodcastEpisodePlayer()
	const searchParams = useSearchParams()
	const shownSeason = toShownPodcastSeason(topic.podcast?.seasons ?? [], searchParams.get("season"))
	const { seasonPodcastEpisodes, isSeasonLoading, loadSeasonPodcastEpisodes } = useSeasonPodcastEpisodes({
		topic,
		shownSeason,
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

// the topic and the season shown
type UseSeasonPodcastEpisodesOptions = { topic: TopicResponse; shownSeason: number | undefined }

// the shown season's podcast episodes, whether an older season is loading,
// and the call that loads an older season again. the latest season's episodes arrive with the topic page
function useSeasonPodcastEpisodes({ topic, shownSeason }: UseSeasonPodcastEpisodesOptions): {
	seasonPodcastEpisodes: SeasonPodcastEpisodes
	isSeasonLoading: boolean
	loadSeasonPodcastEpisodes: () => Promise<void>
} {
	// the season that the server fetched for a url that names a season
	const loadedSeason = useMatch({
		from: "/_layout/topics/$topicId_/$topicSlug",
		shouldThrow: false,
		select: (topicMatch) => topicMatch.loaderData?.fetchedSeason,
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
		const seasonPodcastEpisodes = await fetchSeasonPodcastEpisodes({ topicId: topic.id, season: shownSeason })
		setFetchedSeasons((previousFetchedSeasons) =>
			new Map(previousFetchedSeasons).set(shownSeason, seasonPodcastEpisodes),
		)
	}, [topic.id, shownSeason, isLatestSeason])
	useEffect(() => {
		void loadSeasonPodcastEpisodes()
	}, [loadSeasonPodcastEpisodes])

	// return the latest season's podcast episodes from the topic page, or the older season's episodes once loaded
	if (isLatestSeason) {
		const latestSeasonPodcastEpisodes = topic.podcast?.latestSeasonPodcastEpisodes ?? EMPTY_SEASON_PODCAST_EPISODES
		return { seasonPodcastEpisodes: latestSeasonPodcastEpisodes, isSeasonLoading: false, loadSeasonPodcastEpisodes }
	}
	const seasonPodcastEpisodes = shownFetchedSeasonPodcastEpisodes ?? EMPTY_SEASON_PODCAST_EPISODES
	return { seasonPodcastEpisodes, isSeasonLoading: !shownFetchedSeasonPodcastEpisodes, loadSeasonPodcastEpisodes }
}
