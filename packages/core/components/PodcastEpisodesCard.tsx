import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { isPublishedPodcastEpisode } from "@carlnotes/contracts/podcast"
import { FILMS_NAME, PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import { toPodcastEpisodePath, toTopicPath } from "@carlnotes/contracts/seo"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { type ComponentType, type ReactNode, useState } from "react"
import { toTopicLoadedPodcastEpisode } from "../hooks/useShownPodcastEpisode"
import { toSectionCountLabel } from "../lib/labels"
import { toTabClassName } from "../lib/tabClasses"
import type { PodcastEpisodeRowProps } from "./PodcastEpisodeRow"

// the url query keys that name an older season of Coffee Break podcast episodes and of Coffee Break films
export const PODCAST_EPISODE_SEASON_KEY = "season"
export const FILM_SEASON_KEY = "filmSeason"

// keep browser links and server-rendered overflow in the adapters
export type PodcastEpisodesCardElements = {
	Section: ComponentType<{ title: string; countLabel?: string; children: ReactNode }>
	Card: ComponentType<{ children: ReactNode }>
	Tabs: ComponentType<{ children: ReactNode }>
	Tab: ComponentType<{
		season: number
		topicPath: string
		search: string
		className: string
		isSelected: boolean
		onPress: () => void
	}>
	Loading: ComponentType
	List: ComponentType<{ children: ReactNode; label: string; isLoading: boolean }>
	Row: ComponentType<PodcastEpisodeRowProps>
	Pagination: ComponentType<{
		label: string
		pageNumber: number
		pageCount: number
		onOpenPage: (page: number) => void
	}>
	Remove: ComponentType<{
		podcastEpisode: PodcastEpisode
		onClose: () => void
		onPodcastEpisodeRemoved: () => Promise<void>
	}>
	Failure?: ComponentType<{ onRetry: () => void }>
	Empty?: ComponentType
}
// Coffee Break films: the latest film's podcast episode id, and the press that plays a row's film
export type PodcastEpisodesCardFilmList = {
	latestFilmPodcastEpisodeId: string
	onPlayFilm: (podcastEpisode: PodcastEpisode) => void
}
type RenderedEpisode = { row: PodcastEpisode; className: string }
type RenderEpisodeRows = (
	episodes: PodcastEpisode[],
	options: { pageNumber: number; pageSize: number },
) => RenderedEpisode[]

/**
 * Composes season tabs, five-row pages, selected playback, and permitted episode removal for both apps. With a film
 * list it composes Coffee Break films, whose rows play the film and offer no removal.
 */
export function PodcastEpisodesCard({
	topic,
	shownSeason,
	episodes,
	isLoading,
	isError = false,
	search,
	selectedEpisodeId,
	onOpenSeason,
	onReload,
	onRemoved,
	renderRows = toPageRows,
	onPageView,
	filmList,
	elements: { Section, Card, Tabs, Tab, Loading, List, Row, Pagination, Remove, Failure, Empty },
}: {
	topic: TopicResponse
	shownSeason: number | undefined
	episodes: PodcastEpisode[]
	isLoading: boolean
	isError?: boolean
	search: string
	selectedEpisodeId: string | null | undefined
	onOpenSeason: (season: number) => void
	onReload: () => Promise<void>
	onRemoved: () => Promise<void>
	renderRows?: RenderEpisodeRows
	onPageView?: (pageView: { season: number; page: number }) => void
	filmList?: PodcastEpisodesCardFilmList
	elements: PodcastEpisodesCardElements
}) {
	// reset the page on a season change and clamp it after an episode is removed
	const [openedPage, setOpenedPage] = useState({ season: shownSeason, number: 1 })
	const [podcastEpisodeToRemove, setPodcastEpisodeToRemove] = useState<PodcastEpisode | null>(null)
	const seasons = topic.podcast?.seasons ?? []
	const pageCount = Math.ceil(episodes.length / 5)
	const requestedPage = openedPage.season === shownSeason ? openedPage.number : 1
	const pageNumber = Math.min(requestedPage, Math.max(1, pageCount))
	const rows = renderRows(episodes, { pageNumber, pageSize: 5 })

	// the list's words, its season query key, and its latest mark, for podcast episodes or films
	const rowNoun = filmList ? "film" : "episode"
	const seasonKey = filmList ? FILM_SEASON_KEY : PODCAST_EPISODE_SEASON_KEY
	const latestPodcastEpisodeId = filmList ? filmList.latestFilmPodcastEpisodeId : topic.latestPodcastEpisode?.id
	const canRemovePodcastEpisodes = !filmList && topic.podcast?.canRemovePodcastEpisodes
	if (shownSeason === undefined || !seasons.length) {
		return null
	}
	return (
		<Section
			title={filmList ? FILMS_NAME : `${PODCAST_NAME} episodes`}
			countLabel={toSectionCountLabel(episodes.length, rowNoun)}
		>
			<Card>
				<Tabs>
					{seasons.map((season) => (
						<Tab
							key={season}
							season={season}
							topicPath={toTopicPath(topic)}
							search={toSeasonSearch({ search, seasonKey, season, latestSeason: seasons[0] })}
							isSelected={season === shownSeason}
							onPress={() => {
								onOpenSeason(season)
								onPageView?.({ season, page: 1 })
							}}
							className={toTabClassName(season === shownSeason)}
						/>
					))}
				</Tabs>
				{isLoading && <Loading />}
				{isError && Failure && <Failure onRetry={() => void onReload()} />}
				{!isLoading && !isError && !rows.length && Empty && <Empty />}
				<List label={`Season ${shownSeason} ${rowNoun}s`} isLoading={isLoading}>
					{rows.map(({ row: episode, className }) => (
						<Row
							key={episode.id}
							podcastEpisode={episode}
							className={className}
							isLatestPodcastEpisode={episode.id === latestPodcastEpisodeId}
							isPlayButtonMuted={episode.id !== selectedEpisodeId}
							podcastEpisodePath={isPublishedPodcastEpisode(episode) ? toPodcastEpisodePath(topic, episode) : null}
							onRemovePodcastEpisode={canRemovePodcastEpisodes ? () => setPodcastEpisodeToRemove(episode) : undefined}
							filmPlay={filmList && { onPress: () => filmList.onPlayFilm(episode) }}
						/>
					))}
				</List>
			</Card>
			{pageCount > 1 && (
				<Pagination
					label={`Season ${shownSeason} ${rowNoun} pages`}
					pageNumber={pageNumber}
					pageCount={pageCount}
					onOpenPage={(number) => {
						setOpenedPage({ season: shownSeason, number })
						onPageView?.({ season: shownSeason, page: number })
					}}
				/>
			)}
			{podcastEpisodeToRemove && (
				<Remove
					podcastEpisode={podcastEpisodeToRemove}
					onClose={() => setPodcastEpisodeToRemove(null)}
					onPodcastEpisodeRemoved={async () => {
						// reconcile the parent payload before reloading an older season
						await onRemoved()
						await onReload()
					}}
				/>
			)}
		</Section>
	)
}

/**
 * Selects a linkedPodcastEpisodeId season only if it belongs to this Topic.
 */
export function toShownPodcastSeason(seasons: number[], linkedSeason: string | null | undefined): number | undefined {
	const season = Number(linkedSeason)
	return seasons.includes(season) ? season : seasons[0]
}

/**
 * Selects this Topic's loaded episode before its linked or latest episode.
 */
export function toShownPodcastEpisodeId({
	topic,
	loadedPodcastEpisode,
	linkedPodcastEpisodeId,
}: ToShownPodcastEpisodeIdOptions): string | null | undefined {
	return (
		toTopicLoadedPodcastEpisode(topic.id, loadedPodcastEpisode)?.id ??
		linkedPodcastEpisodeId ??
		topic.latestPodcastEpisode?.id
	)
}

type ToShownPodcastEpisodeIdOptions = {
	topic: TopicResponse
	loadedPodcastEpisode: PodcastEpisode | null
	linkedPodcastEpisodeId: string | null | undefined
}
type ToSeasonSearchOptions = { search: string; seasonKey: string; season: number; latestSeason: number | undefined }

// preserve unrelated query parameters when selecting an older season
function toSeasonSearch({ search, seasonKey, season, latestSeason }: ToSeasonSearchOptions): string {
	const params = new URLSearchParams(search)
	params.delete(seasonKey)
	if (season !== latestSeason) {
		params.set(seasonKey, String(season))
	}
	return `?${params}`
}

// the browser replaces this slice with its no-JavaScript row selection
const toPageRows: RenderEpisodeRows = (episodes, { pageNumber, pageSize }) =>
	episodes
		.slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
		.map((row, index) => ({ row, className: index ? "border-t border-dashed border-separator-strong" : "" }))
