import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { isPublishedPodcastEpisode } from "@carlnotes/contracts/podcast"
import { PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import { toPodcastEpisodePath, toTopicPath } from "@carlnotes/contracts/seo"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { cn } from "@carlnotes/nightshift/classNames"
import { type ComponentType, type ReactNode, useState } from "react"
import type { PodcastEpisodeRowProps } from "./PodcastEpisodeRow"

// keep browser links and server-rendered overflow in the adapters
export type PodcastEpisodesCardElements = {
	Section: ComponentType<{ title: string; children: ReactNode }>
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
type RenderedEpisode = { row: PodcastEpisode; className: string }
type RenderEpisodeRows = (
	episodes: PodcastEpisode[],
	options: { pageNumber: number; pageSize: number },
) => RenderedEpisode[]

/**
 * Composes season tabs, five-row pages, selected playback, and permitted episode removal for both apps.
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
	if (shownSeason === undefined || !seasons.length) {
		return null
	}
	return (
		<Section title={`${PODCAST_NAME} episodes`}>
			<Card>
				<Tabs>
					{seasons.map((season) => (
						<Tab
							key={season}
							season={season}
							topicPath={toTopicPath(topic)}
							search={toSeasonSearch({ search, season, latestSeason: seasons[0] })}
							isSelected={season === shownSeason}
							onPress={() => onOpenSeason(season)}
							className={cn(
								"flex min-h-11 items-center border-b-[3px] px-3.5 text-sm sm:min-h-9",
								season === shownSeason
									? "border-primary font-bold"
									: "text-muted-foreground border-transparent font-semibold",
							)}
						/>
					))}
				</Tabs>
				{isLoading && <Loading />}
				{isError && Failure && <Failure onRetry={() => void onReload()} />}
				{!isLoading && !isError && !rows.length && Empty && <Empty />}
				<List label={`Season ${shownSeason} episodes`} isLoading={isLoading}>
					{rows.map(({ row: episode, className }) => (
						<Row
							key={episode.id}
							podcastEpisode={episode}
							className={className}
							isLatestPodcastEpisode={episode.id === topic.latestPodcastEpisode?.id}
							isPlayButtonMuted={episode.id !== selectedEpisodeId}
							podcastEpisodePath={isPublishedPodcastEpisode(episode) ? toPodcastEpisodePath(topic, episode) : null}
							onRemovePodcastEpisode={
								topic.podcast?.canRemovePodcastEpisodes ? () => setPodcastEpisodeToRemove(episode) : undefined
							}
						/>
					))}
				</List>
			</Card>
			{pageCount > 1 && (
				<Pagination
					label={`Season ${shownSeason} episode pages`}
					pageNumber={pageNumber}
					pageCount={pageCount}
					onOpenPage={(number) => setOpenedPage({ season: shownSeason, number })}
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
		(loadedPodcastEpisode?.topicId === topic.id ? loadedPodcastEpisode.id : undefined) ??
		linkedPodcastEpisodeId ??
		topic.latestPodcastEpisode?.id
	)
}

type ToShownPodcastEpisodeIdOptions = {
	topic: TopicResponse
	loadedPodcastEpisode: PodcastEpisode | null
	linkedPodcastEpisodeId: string | null | undefined
}
type ToSeasonSearchOptions = { search: string; season: number; latestSeason: number | undefined }

// preserve unrelated query parameters when selecting an older season
function toSeasonSearch({ search, season, latestSeason }: ToSeasonSearchOptions): string {
	const params = new URLSearchParams(search)
	params.delete("season")
	if (season !== latestSeason) {
		params.set("season", String(season))
	}
	return `?${params}`
}

// the browser replaces this slice with its no-JavaScript row selection
const toPageRows: RenderEpisodeRows = (episodes, { pageNumber, pageSize }) =>
	episodes
		.slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
		.map((row, index) => ({ row, className: index ? "border-t border-dashed border-separator-strong" : "" }))
