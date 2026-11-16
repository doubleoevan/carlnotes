import type { McpViewTopicMemories } from "@carlnotes/contracts/mcpViews"
import { TOPIC_MEMORY_PAGE_SIZE, toTopicMemoryPageNumber } from "@carlnotes/contracts/topicMemories"
import { TOPIC_MEMORIES_TITLE } from "@carlnotes/core/components/TopicMemoriesDialog"
import { useState } from "react"
import { Pagination } from "@/components/common/Pagination"
import { TopicMemoriesList, TopicMemoryRow, TopicMemorySkeleton } from "@/components/primitives/topic-memories-list"
import { callMcpViewTool, PAGE_FAILED_TEXT, toMcpViewData } from "./mcpViewHost"

/** Shows the Journal's read-only Nightshift list and pages through the authorized MCP tool. */
export function TopicMemoriesMcpView({ topicMemories }: { topicMemories: McpViewTopicMemories }) {
	// retain the previous page for skeleton sizing and for recovery when a tool call fails
	const [shown, setShown] = useState(topicMemories)
	const [loadingPage, setLoadingPage] = useState<number | null>(null)
	const [pageFailed, setPageFailed] = useState(false)
	const firstItemNumber = (shown.pageNumber - 1) * TOPIC_MEMORY_PAGE_SIZE + 1

	// call the same read-only tool so each page rechecks the reader's access
	const handleOpenPage = async (page: number): Promise<void> => {
		if (loadingPage !== null || page === shown.pageNumber) {
			return
		}
		// use the page from the tool's current grouped snapshot
		setLoadingPage(page)
		setPageFailed(false)
		const next = await readTopicMemoryPage(shown.topicId, page)
		if (next) {
			setShown(next)
		} else {
			setPageFailed(true)
		}
		setLoadingPage(null)
	}
	return (
		<section className="grid gap-3">
			<h2 className="font-display text-xl">{TOPIC_MEMORIES_TITLE}</h2>
			{/* preserve the list and pager while the host reads the next page */}
			{shown.pageCount === 0 ? (
				<p className="text-muted-foreground text-sm">Carl hasn’t written any takeaways yet.</p>
			) : (
				<TopicMemoriesList isLoading={loadingPage !== null}>
					{shown.items.map(({ id, text }, index) => {
						const row = { text, itemNumber: firstItemNumber + index, isLast: index === shown.items.length - 1 }
						return loadingPage !== null ? (
							<TopicMemorySkeleton key={id} {...row} />
						) : (
							<TopicMemoryRow key={id} {...row} />
						)
					})}
				</TopicMemoriesList>
			)}
			{shown.pageCount > 1 && (
				<Pagination
					ariaLabel="Takeaways pages"
					pageNumber={loadingPage ?? shown.pageNumber}
					pageCount={shown.pageCount}
					onOpenPage={(page) => void handleOpenPage(page)}
				/>
			)}
			{pageFailed && (
				<p role="alert" className="text-destructive text-sm">
					{PAGE_FAILED_TEXT}
				</p>
			)}
		</section>
	)
}

async function readTopicMemoryPage(topicId: string, page: number): Promise<McpViewTopicMemories | undefined> {
	// validate the host result before it can replace the current page
	const result = await callMcpViewTool("read_topic_memories", { topic_id: topicId, page }).catch(() => null)
	const topicMemories = result && !result.isError ? toMcpViewData(result._meta).topicMemories : undefined
	return topicMemories?.topicId === topicId &&
		topicMemories.pageNumber === toTopicMemoryPageNumber(page, topicMemories.pageCount)
		? topicMemories
		: undefined
}
