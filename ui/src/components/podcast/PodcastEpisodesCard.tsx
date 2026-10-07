import type { PodcastEpisode, SeasonPodcastEpisodes, TopicResponse } from "@shared/contracts"
import { PODCAST_NAME } from "@shared/podcastEpisodes"
import { toPodcastEpisodePath, toTopicPath } from "@shared/seo"
import { defaultParseSearch, Link, useMatch } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { fetchSeasonPodcastEpisodes } from "@/clients/podcastEpisodeClient"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Pagination } from "@/components/common/Pagination"
import { PodcastEpisodeRow } from "@/components/podcast/PodcastEpisodeRow"
import { RemovePodcastEpisodeDialog } from "@/components/podcast/RemovePodcastEpisodeDialog"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { useSearchParams } from "@/hooks/useSearchParams"
import { RESOURCE_LIST_CARD_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { usePodcastEpisodePlayer } from "@/stores/podcastEpisodePlayerStore"

// a season with no podcast episodes, which shows while an older season loads
const EMPTY_SEASON_PODCAST_EPISODES: SeasonPodcastEpisodes = { podcastEpisodes: [] }

// how many of a season's podcast episodes the card shows on one page
const SEASON_PODCAST_EPISODES_PER_PAGE = 5

// the loading animation, as tall as a full page of rows. the card keeps its height while a season loads
const SEASON_LOADING_CLASS = "min-h-80 text-base sm:min-h-70"

// the topic, and the call that runs after a podcast episode is removed
type PodcastEpisodesCardProps = { topic: TopicResponse; onPodcastEpisodeRemoved: () => Promise<void> }

/**
 * The topic page's card of a topic's podcast episodes, one season and one page of episodes at a time.
 */
export function PodcastEpisodesCard({ topic, onPodcastEpisodeRemoved }: PodcastEpisodesCardProps) {
	// the topic's seasons, newest first, the id of its latest podcast episode, and the episode that the player has loaded
	const seasons = topic.podcast?.seasons ?? []
	const latestPodcastEpisodeId = topic.latestPodcastEpisode?.id
	const { podcastEpisode: loadedPodcastEpisode } = usePodcastEpisodePlayer()

	// the id of the podcast episode that the player card shows. the loaded episode of this topic comes first,
	// then the linked episode, then the topic's latest
	const searchParams = useSearchParams()
	const linkedPodcastEpisodeId = searchParams.get("episode")
	const topicLoadedPodcastEpisodeId = loadedPodcastEpisode?.topicId === topic.id ? loadedPodcastEpisode.id : undefined
	const playerCardPodcastEpisodeId = topicLoadedPodcastEpisodeId ?? linkedPodcastEpisodeId ?? latestPodcastEpisodeId

	// the season shown is the season that the url names if the topic has that season, and the latest season otherwise
	const linkedSeason = Number(searchParams.get("season"))
	const shownSeason = seasons.includes(linkedSeason) ? linkedSeason : seasons[0]

	// the page that was opened, with its season. another season opens on its first page.
	// the podcast episode that the confirm dialog is about to remove
	const [openedPage, setOpenedPage] = useState({ season: shownSeason, pageNumber: 1 })
	const openedPageNumber = openedPage.season === shownSeason ? openedPage.pageNumber : 1
	const [podcastEpisodeToRemove, setPodcastEpisodeToRemove] = useState<PodcastEpisode | null>(null)

	// the topic page's query with a season's tab selected. the latest season needs no season in the url
	const toSeasonSearch = (season: number): string => {
		const seasonSearchParams = new URLSearchParams(searchParams)
		seasonSearchParams.delete("season")
		if (season !== seasons[0]) {
			seasonSearchParams.set("season", String(season))
		}
		return `?${seasonSearchParams}`
	}

	// the shown season's podcast episodes, whether the season is loading, and the call that loads an older season again
	const { seasonPodcastEpisodes, isSeasonLoading, loadSeasonPodcastEpisodes } = useSeasonPodcastEpisodes({
		topic,
		shownSeason,
	})

	// how many pages the season has, the page shown, which stays within those pages, and where that page starts
	const pageCount = Math.ceil(seasonPodcastEpisodes.podcastEpisodes.length / SEASON_PODCAST_EPISODES_PER_PAGE)
	const pageNumber = Math.min(openedPageNumber, Math.max(1, pageCount))
	const pageStartIndex = (pageNumber - 1) * SEASON_PODCAST_EPISODES_PER_PAGE

	if (seasons.length === 0) {
		return null
	}
	return (
		<CollapsibleSection value="episodes" title={`${PODCAST_NAME} episodes`}>
			<div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1")}>
				{/* one tab per season, the newest first. a tab is a link, so a season opens without JavaScript too */}
				<nav aria-label="Seasons" className="flex gap-1 px-2">
					{seasons.map((season) => (
						<Link
							key={season}
							to={toTopicPath(topic)}
							search={defaultParseSearch(toSeasonSearch(season))}
							replace
							resetScroll={false}
							// mark a tab current only on an exact url match. a partial match also marks the latest season's tab
							activeOptions={{ exact: true }}
							className={cn(
								"flex min-h-11 items-center border-b-[3px] px-3.5 text-sm sm:min-h-9",
								season === shownSeason
									? "border-primary font-bold"
									: "text-muted-foreground border-transparent font-semibold",
							)}
						>
							{season}
						</Link>
					))}
				</nav>
				{/* the loading animation while the season loads */}
				{isSeasonLoading && <CoffeeLoading className={SEASON_LOADING_CLASS} />}
				{/* the season's podcast episodes. with JavaScript, only the rows of the page shown stay visible */}
				<ol aria-label={`Season ${shownSeason} episodes`} className={cn(isSeasonLoading && "hidden")}>
					{seasonPodcastEpisodes.podcastEpisodes.map((podcastEpisode, podcastEpisodeIndex) => (
						<PodcastEpisodeRow
							key={podcastEpisode.id}
							podcastEpisode={podcastEpisode}
							className={cn(
								Math.floor(podcastEpisodeIndex / SEASON_PODCAST_EPISODES_PER_PAGE) !== pageNumber - 1 &&
									"scripted:hidden",
								podcastEpisodeIndex === pageStartIndex && "scripted:after:hidden",
							)}
							isLatestPodcastEpisode={podcastEpisode.id === latestPodcastEpisodeId}
							isPlayButtonMuted={podcastEpisode.id !== playerCardPodcastEpisodeId}
							podcastEpisodePath={toPodcastEpisodePath(topic, podcastEpisode)}
							onRemovePodcastEpisode={
								topic.podcast?.canRemovePodcastEpisodes ? () => setPodcastEpisodeToRemove(podcastEpisode) : undefined
							}
						/>
					))}
				</ol>
			</div>
			{/* the page numbers under the card */}
			{pageCount > 1 && (
				<Pagination
					ariaLabel={`Season ${shownSeason} episode pages`}
					pageNumber={pageNumber}
					pageCount={pageCount}
					onOpenPage={(nextPageNumber) => setOpenedPage({ season: shownSeason, pageNumber: nextPageNumber })}
				/>
			)}
			{/* the dialog that confirms removing a podcast episode */}
			{podcastEpisodeToRemove && (
				<RemovePodcastEpisodeDialog
					podcastEpisode={podcastEpisodeToRemove}
					onPodcastEpisodeRemoved={async () => {
						// call onPodcastEpisodeRemoved, then reload the season
						await onPodcastEpisodeRemoved()
						await loadSeasonPodcastEpisodes()
					}}
					onClose={() => setPodcastEpisodeToRemove(null)}
				/>
			)}
		</CollapsibleSection>
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
		const seasonPodcastEpisodes = await fetchSeasonPodcastEpisodes(topic.id, shownSeason)
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
