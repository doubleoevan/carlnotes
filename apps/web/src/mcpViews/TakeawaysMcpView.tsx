import type { McpViewTakeaways } from "@carlnotes/contracts/mcpViews"
import { TOPIC_MEMORY_PAGE_SIZE } from "@carlnotes/contracts/topicMemories"
import { TAKEAWAYS_TITLE } from "@carlnotes/core/components/TopicMemoriesDialog"
import { useState } from "react"
import { Pagination } from "@/components/common/Pagination"
import { TakeawayRow, TakeawaySkeleton, TakeawaysList } from "@/components/primitives/takeaways-list"
import { callMcpViewTool, PAGE_FAILED_TEXT, toMcpViewData } from "./mcpViewHost"

/** Shows the Journal's read-only Nightshift list and pages through the authorized MCP tool. */
export function TakeawaysMcpView({ takeaways }: { takeaways: McpViewTakeaways }) {
	// retain the previous page for skeleton sizing and for recovery when a tool call fails
	const [shown, setShown] = useState(takeaways)
	const [loadingPage, setLoadingPage] = useState<number | null>(null)
	const [pageFailed, setPageFailed] = useState(false)
	const firstItemNumber = (shown.pageNumber - 1) * TOPIC_MEMORY_PAGE_SIZE + 1

	// call the same read-only tool so each page rechecks the reader's access
	const handleOpenPage = async (page: number): Promise<void> => {
		if (loadingPage !== null || page === shown.pageNumber) {
			return
		}
		setLoadingPage(page)
		setPageFailed(false)
		const result = await callMcpViewTool("read_topic_memories", { topic_id: shown.topicId, page }).catch(() => null)
		const next = result && !result.isError ? toMcpViewData(result._meta).takeaways : undefined
		if (next?.topicId === shown.topicId && next.pageNumber === page) {
			setShown(next)
		} else {
			setPageFailed(true)
		}
		setLoadingPage(null)
	}
	return (
		<section className="grid gap-3">
			<h2 className="font-display text-xl">{TAKEAWAYS_TITLE}</h2>
			{/* preserve the list and pager while the host reads the next page */}
			{shown.pageCount === 0 ? (
				<p className="text-muted-foreground text-sm">Carl hasn’t written any takeaways yet.</p>
			) : (
				<TakeawaysList isLoading={loadingPage !== null}>
					{shown.items.map(({ id, text }, index) => {
						const row = { text, itemNumber: firstItemNumber + index, isLast: index === shown.items.length - 1 }
						return loadingPage !== null ? <TakeawaySkeleton key={id} {...row} /> : <TakeawayRow key={id} {...row} />
					})}
				</TakeawaysList>
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
