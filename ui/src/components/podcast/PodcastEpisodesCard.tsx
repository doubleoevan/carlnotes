import type { PodcastEpisode, SeasonPodcastEpisodes, TopicResponse } from "@shared/contracts"
import { toPodcastEpisodePath, toTopicPath } from "@shared/seo"
import { defaultParseSearch, Link, useMatch } from "@tanstack/react-router"
import { Pause, Play, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { fetchSeasonPodcastEpisodes, sendRemovePodcastEpisode } from "@/clients/podcastEpisodeClient"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Pagination } from "@/components/common/Pagination"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { useSearchParams } from "@/hooks/useSearchParams"
import { toPodcastEpisodeDateLabel, toPodcastEpisodeDurationLabel } from "@/lib/labels"
import {
	DASHED_ROW_CLASS,
	PLAY_BUTTON_CLASS,
	PLAY_BUTTON_MUTED_CLASS,
	RESOURCE_LIST_CARD_CLASS,
} from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import {
	togglePodcastEpisodePlayback,
	unloadPodcastEpisode,
	usePodcastEpisodePlayer,
} from "@/stores/podcastEpisodePlayerStore"

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
	const latestPodcastEpisodeId = topic.podcast?.latestPodcastEpisode?.id
	const { podcastEpisode: loadedPodcastEpisode, isPlaying } = usePodcastEpisodePlayer()

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

	// remove the podcast episode, unload the episode, then call onPodcastEpisodeRemoved and reload the season
	const handleRemovePodcastEpisode = async (): Promise<void> => {
		if (!podcastEpisodeToRemove) {
			return
		}
		const isPodcastEpisodeRemoved = await sendRemovePodcastEpisode(podcastEpisodeToRemove.id)
		setPodcastEpisodeToRemove(null)
		if (!isPodcastEpisodeRemoved) {
			toast.error("That episode didn't budge. Carl suggests trying again.")
			return
		}
		unloadPodcastEpisode(podcastEpisodeToRemove.id)
		await onPodcastEpisodeRemoved()
		await loadSeasonPodcastEpisodes()
	}
	if (seasons.length === 0) {
		return null
	}
	return (
		<CollapsibleSection value="episodes" title="Coffee Break podcast episodes">
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
							isPlayerCardPodcastEpisode={podcastEpisode.id === playerCardPodcastEpisodeId}
							isPodcastEpisodePlaying={loadedPodcastEpisode?.id === podcastEpisode.id && isPlaying}
							podcastEpisodePath={toPodcastEpisodePath(topic, podcastEpisode)}
							onTogglePlayback={() => void togglePodcastEpisodePlayback(podcastEpisode.id)}
							onRemove={
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
				<ConfirmDialog
					title="Remove this episode?"
					confirmLabel="Remove episode"
					cancelLabel="Keep it"
					onConfirm={() => void handleRemovePodcastEpisode()}
					onClose={() => setPodcastEpisodeToRemove(null)}
				>
					{`Episode ${podcastEpisodeToRemove.episodeNumber}, "${podcastEpisodeToRemove.title}", leaves this page, every podcast feed, and its own page for good. Its number is not used again.`}
				</ConfirmDialog>
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

// one podcast episode's row, with its play button, its title linked to the episode's page, its date and duration,
// and the remove button if the user may remove episodes
function PodcastEpisodeRow({
	podcastEpisode,
	isLatestPodcastEpisode,
	isPlayerCardPodcastEpisode,
	isPodcastEpisodePlaying,
	podcastEpisodePath,
	className,
	onTogglePlayback,
	onRemove,
}: {
	podcastEpisode: PodcastEpisode
	isLatestPodcastEpisode: boolean
	isPlayerCardPodcastEpisode: boolean
	isPodcastEpisodePlaying: boolean
	podcastEpisodePath: string
	className?: string
	onTogglePlayback: () => void
	onRemove?: () => void
}) {
	const podcastEpisodeDetailLabels = [
		toPodcastEpisodeDateLabel(podcastEpisode.publishedAt),
		toPodcastEpisodeDurationLabel(podcastEpisode.durationSeconds),
	]
	return (
		<li
			className={cn(
				DASHED_ROW_CLASS,
				"isolate flex items-center gap-3 py-2.5 pr-1 pl-2 before:absolute before:inset-0 before:-z-10",
				"hover:before:bg-accent-foreground/20 before:rounded-lg before:transition-colors",
				className,
			)}
		>
			{/* the play button, in the primary color on the player card's podcast episode.
			    the button's click area covers the row */}
			<button
				type="button"
				aria-label={`${isPodcastEpisodePlaying ? "Pause" : "Play"} episode ${podcastEpisode.episodeNumber}`}
				onClick={onTogglePlayback}
				className={cn(
					PLAY_BUTTON_CLASS,
					"size-11 after:absolute after:inset-0 sm:size-9",
					!isPlayerCardPodcastEpisode && PLAY_BUTTON_MUTED_CLASS,
				)}
			>
				{isPodcastEpisodePlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
			</button>
			{/* the podcast episode's number and title, over its date and duration */}
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-bold">
					<AnchorLink href={podcastEpisodePath} className="relative z-10 hover:underline">
						{`E${podcastEpisode.episodeNumber} · ${podcastEpisode.title}`}
					</AnchorLink>
				</div>
				<div className="text-muted-foreground text-xs" suppressHydrationWarning>
					{[...podcastEpisodeDetailLabels, ...(isLatestPodcastEpisode ? ["latest"] : [])].join(" · ")}
				</div>
			</div>
			{/* the remove button */}
			{onRemove && (
				<button
					type="button"
					aria-label={`Remove episode ${podcastEpisode.episodeNumber}`}
					onClick={onRemove}
					className={cn(
						"text-muted-foreground hover:text-destructive relative z-10",
						"grid size-11 shrink-0 place-items-center sm:size-9",
					)}
				>
					<Trash2 className="size-4" />
				</button>
			)}
		</li>
	)
}
