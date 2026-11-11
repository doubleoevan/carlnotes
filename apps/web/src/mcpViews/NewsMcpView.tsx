import { MCP_NEWS_PAGE_SIZE, type McpViewNews } from "@carlnotes/contracts/mcpViews"
import { NEWS_PAGE_SIZE, type NewsResponse, type NewsWindow } from "@carlnotes/contracts/news"
import { CommentMentionList, type CommentMentionListElements } from "@carlnotes/core/components/CommentMentionList"
import { NewsList, type NewsListElements, type NewsListRowProps } from "@carlnotes/core/components/NewsList"
import type { NewsPageLoader } from "@carlnotes/core/hooks/useNews"
import { COMMENT_MENTIONS_TITLE } from "@carlnotes/core/lib/socialLabels"
import { setCommentMentions } from "@carlnotes/core/stores/commentMentionStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { useEffect, useRef } from "react"
import { COMMENT_MENTION_LIST_ELEMENTS } from "@/components/social/CommentMentionList"
import { NEWS_LIST_ELEMENTS, NewsEventRow } from "@/components/social/NewsList"
import { RESOURCE_LIST_CARD_CLASS } from "@/lib/styleClasses"
import { captureVisitEvent } from "@/lib/visitAnalytics"
import {
	addMcpViewPodcastEpisodes,
	callMcpViewTool,
	toMcpViewData,
	toToolResultText,
	useMcpViewData,
} from "./mcpViewHost"
import { MCP_VIEW_TOPIC_POST_INFO_ELEMENTS } from "./mcpViewTopicPostInfoElements"

/**
 * The news MCP view: the caller's unseen Comment Mentions, then the news the tool read, as the site's own list with its
 * Week, Day, Hour picker and its pages. The view makes no tool call on load and marks no mention seen. Choosing a
 * window calls the tool with it, a Topic Post's info popup reads the post through its tool, and a row and a mention
 * open their pages on the site through the host.
 */
export function NewsMcpView({ news }: { news: McpViewNews }) {
	const { session } = useMcpViewData()

	// the shared mentions list reads the mentions from its store, which empties as the view leaves
	useEffect(() => {
		setCommentMentions(news.commentMentions)
		return () => setCommentMentions([])
	}, [news.commentMentions])

	// each window's tool results read so far, from the result the view opened on
	const toolPagesRef = useRef(new Map<NewsWindow, McpViewNews[]>([[news.window, [news]]]))

	// read the window's tool results up to the one that holds the page, each from the cursor of the one before it
	const loadNewsPage: NewsPageLoader = async ({ window, page }) => {
		const toolPages = toolPagesRef.current.get(window) ?? []
		const toolPageIndex = Math.floor(((page - 1) * NEWS_PAGE_SIZE) / MCP_NEWS_PAGE_SIZE)
		let toolPage = toolPages[toolPageIndex]
		while (!toolPage) {
			toolPage = await readNewsToolPage(window, toolPages.at(-1)?.nextCursor)
			toolPages.push(toolPage)
			toolPagesRef.current.set(window, toolPages)
			toolPage = toolPages[toolPageIndex]
		}
		return toNewsListPage(toolPage, page)
	}
	return (
		<>
			{/* the caller's unseen mentions, each a link to its Comment on the site */}
			{news.commentMentions.length > 0 && (
				<section aria-label={COMMENT_MENTIONS_TITLE} className={cn(RESOURCE_LIST_CARD_CLASS, "mb-3 p-5")}>
					<h2 className="font-display mb-2 text-xl">{COMMENT_MENTIONS_TITLE}</h2>
					<CommentMentionList onChoose={ignoreChoice} elements={MCP_VIEW_COMMENT_MENTION_LIST_ELEMENTS} />
				</section>
			)}
			{/* the news, from the tool result's first rows */}
			<NewsList
				profileUserId={null}
				userId={session?.userId ?? null}
				firstPage={toNewsListPage(news, 1)}
				firstWindow={news.window}
				loadNewsPage={loadNewsPage}
				captureVisitEvent={captureVisitEvent}
				elements={MCP_VIEW_NEWS_LIST_ELEMENTS}
			/>
		</>
	)
}

// a row with no Topic note and no Video pill, for an MCP view that reads no Topic and plays no film. a Topic Post's
// row keeps its info popup, which reads the post through its tool
function McpViewNewsEventRow(props: NewsListRowProps) {
	return (
		<NewsEventRow
			{...props}
			videoButton={null}
			isTopicNoteOffered={false}
			topicPostInfoElements={MCP_VIEW_TOPIC_POST_INFO_ELEMENTS}
		/>
	)
}

// the web's elements of the list, with the MCP view's row
const MCP_VIEW_NEWS_LIST_ELEMENTS: NewsListElements = { ...NEWS_LIST_ELEMENTS, Row: McpViewNewsEventRow }

// the web's elements of the mentions list, with no action that marks a mention seen and no line for an empty list
const MCP_VIEW_COMMENT_MENTION_LIST_ELEMENTS: CommentMentionListElements = {
	...COMMENT_MENTION_LIST_ELEMENTS,
	Empty: () => null,
	MarkAllSeen: () => null,
}

// a chosen mention opens through its own link, so the list's choice does nothing more
function ignoreChoice(): void {}

// read one tool result of a window through the host, from a cursor or from the window's start, throwing an error
// with the tool's own words if it holds no news
async function readNewsToolPage(window: NewsWindow, cursor: string | null | undefined): Promise<McpViewNews> {
	const toolResult = await callMcpViewTool("read_news", cursor ? { window, cursor } : { window })
	const { news, podcastEpisodes } = toMcpViewData(toolResult._meta)
	if (toolResult.isError || !news) {
		throw new Error(toToolResultText(toolResult.content))
	}

	// keep the result's podcast episodes for its rows' play buttons
	addMcpViewPodcastEpisodes(podcastEpisodes)
	return news
}

// one page of the list out of the tool result that holds it
function toNewsListPage({ newsPage }: McpViewNews, page: number): NewsResponse {
	const firstRowIndex = ((page - 1) * NEWS_PAGE_SIZE) % MCP_NEWS_PAGE_SIZE
	return { ...newsPage, newsEvents: newsPage.newsEvents.slice(firstRowIndex, firstRowIndex + NEWS_PAGE_SIZE) }
}
