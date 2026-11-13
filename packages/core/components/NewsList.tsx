import type { AnalyticsEventProperties, VisitAnalyticsEvent } from "@carlnotes/contracts/analyticsEvents"
import {
	NEWS_FAILED_TEXT,
	NEWS_PAGE_SIZE,
	NEWS_TITLE,
	NEWS_WINDOW_LABELS,
	type NewsEvent,
	type NewsPlace,
	type NewsResponse,
	type NewsWindow,
	newsWindows,
	toEmptyNewsText,
} from "@carlnotes/contracts/news"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { ComponentType, ReactNode } from "react"
import type { NewsPageLoader } from "../hooks/useNews"
import { useNewsList } from "../hooks/useNewsList"
import {
	toNewsEventDetailsTexts,
	toNewsEventPodcastEpisode,
	toNewsEventText,
	toNewsEventTimeLabel,
	toNewsEventVideoButton,
} from "../lib/newsEvents"
import type { PodcastEpisodeVideoButtonProps } from "./PodcastEpisodeVideoButton"

// one row as the platform draws it: the News Event, its number in the window, its title, the line under the title,
// how long ago it happened, whether it is the page's first, the Podcast Episode its play button plays, if it has
// one, and its Video button, if that Podcast Episode's row has a film
export type NewsListRowProps = {
	newsEvent: NewsEvent
	rank: number
	text: string
	detailsTexts: string[]
	timeLabel: string
	isFirst: boolean
	podcastEpisode: PodcastEpisode | null
	videoButton: PodcastEpisodeVideoButtonProps | null
}

// the platform elements of the news: the card, the heading that opens and closes the list with the window picker
// beside it, carl's opener, the picker
// and one of its options, the rows' list, one row, a line of text with an optional retry, the placeholder while a page
// loads, and the page buttons under the rows
export type NewsListElements = {
	Card: ComponentType<{ children: ReactNode }>
	Heading: ComponentType<{ picker: ReactNode; isExpanded: boolean; onToggle: () => void; children: ReactNode }>
	Opener: ComponentType<{ children: ReactNode }>
	WindowPicker: ComponentType<{ label: string; children: ReactNode }>
	WindowOption: ComponentType<{ isSelected: boolean; onSelect: () => void; children: ReactNode }>
	List: ComponentType<{ children: ReactNode }>
	Row: ComponentType<NewsListRowProps>
	Notice: ComponentType<{ onRetry?: () => void; children: ReactNode }>
	Loading: ComponentType
	Pagination: ComponentType<{
		label: string
		pageNumber: number
		pageCount: number
		onOpenPage: (pageNumber: number) => void
	}>
}

// whose news it is, who reads it, what shows above the rows, how the app sends a visit event, and the platform's
// elements
type NewsListProps = {
	// null for the signed-in user's own news on the home
	profileUserId: string | null
	userId: string | null
	// carl's line for the day, which shows above the rows
	opener?: string | null
	// the first page of the first window's news, if it is already read, and that window, the week unless named
	firstPage?: NewsResponse
	firstWindow?: NewsWindow
	// the read of a page in place of the api's, such as an MCP view's tool call
	loadNewsPage?: NewsPageLoader
	captureVisitEvent: (event: VisitAnalyticsEvent, properties: AnalyticsEventProperties) => void
	elements: NewsListElements
}

/**
 * Shows the news of a window under its title, as the search results list their rows: numbered, five to a page, with
 * the page buttons under the card. The picker beside the title chooses the week, the day, or the hour.
 */
export function NewsList({ opener, elements, ...newsListOptions }: NewsListProps) {
	const { userId } = newsListOptions
	const newsList = useNewsList(newsListOptions)
	const { Card, Heading, Opener, WindowPicker, WindowOption, Pagination } = elements
	return (
		<>
			<Card>
				<Heading
					isExpanded={newsList.isExpanded}
					onToggle={newsList.toggle}
					picker={
						<WindowPicker label={`${NEWS_TITLE} window`}>
							{newsWindows.map((newsWindow) => (
								<WindowOption
									key={newsWindow}
									isSelected={newsWindow === newsList.window}
									onSelect={() => newsList.selectWindow(newsWindow)}
								>
									{NEWS_WINDOW_LABELS[newsWindow]}
								</WindowOption>
							))}
						</WindowPicker>
					}
				>
					{NEWS_TITLE}
				</Heading>
				{/* a closed list shows its heading alone */}
				{newsList.isExpanded && opener && <Opener>{opener}</Opener>}
				{newsList.isExpanded && (
					<NewsRows
						newsPage={newsList.newsPage}
						place={newsList.place}
						window={newsList.window}
						pageNumber={newsList.pageNumber}
						readerUserId={userId}
						hasFailed={newsList.hasFailed}
						onRetry={newsList.retry}
						elements={elements}
					/>
				)}
			</Card>
			{/* the page buttons under the card, for an open list whose window holds more than one page */}
			{newsList.isExpanded && newsList.pageCount > 1 && (
				<Pagination
					label={`${NEWS_TITLE} pages`}
					pageNumber={newsList.pageNumber}
					pageCount={newsList.pageCount}
					onOpenPage={newsList.openPage}
				/>
			)}
		</>
	)
}

// the page read, where the list shows, the window, the page's number, who reads it, and what a retry does
type NewsRowsProps = {
	newsPage: NewsResponse | undefined
	place: NewsPlace
	window: NewsWindow
	pageNumber: number
	readerUserId: string | null
	hasFailed: boolean
	onRetry: () => void
	elements: NewsListElements
}

// the page's rows, or the line a failed, loading, or empty window shows
function NewsRows({
	newsPage,
	place,
	window,
	pageNumber,
	readerUserId,
	hasFailed,
	onRetry,
	elements: { List, Row, Notice, Loading },
}: NewsRowsProps) {
	// a window that failed offers a retry, and one still loading shows the platform's placeholder
	if (!newsPage) {
		return hasFailed ? <Notice onRetry={onRetry}>{NEWS_FAILED_TEXT}</Notice> : <Loading />
	}

	// a window with no News Event shows one line
	if (newsPage.total === 0) {
		return <Notice>{toEmptyNewsText(window)}</Notice>
	}

	// each row numbered across the window's pages, as the search results number theirs
	const firstRank = (pageNumber - 1) * NEWS_PAGE_SIZE + 1
	const now = Date.now()
	return (
		<List>
			{newsPage.newsEvents.map((newsEvent, index) => {
				// when the row happened, and the Podcast Episode its play button plays
				const timeLabel = toNewsEventTimeLabel(newsEvent, now)
				const podcastEpisode = toNewsEventPodcastEpisode(newsEvent, newsPage.podcastEpisodes)
				return (
					<Row
						key={newsEvent.id}
						newsEvent={newsEvent}
						rank={firstRank + index}
						text={toNewsEventText(newsEvent, readerUserId)}
						detailsTexts={toNewsEventDetailsTexts(newsEvent, timeLabel)}
						timeLabel={timeLabel}
						isFirst={index === 0}
						podcastEpisode={podcastEpisode}
						videoButton={toNewsEventVideoButton({ newsEvent, podcastEpisode, place })}
					/>
				)
			})}
		</List>
	)
}
