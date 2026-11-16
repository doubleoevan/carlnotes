// read only the open Journal's current page and keep unsent feedback after a failed write
import { fetchTopicMemories, rateTopicMemory } from "@carlnotes/client/topicMemoriesClient"
import type { TopicMemoriesPage, TopicMemory, TopicMemoryFeedback } from "@carlnotes/contracts/topicMemories"
import { type UseQueryResult, useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

// retain the page's own number so its skeleton can match the previous row widths
type TopicMemoriesResult = TopicMemoriesPage & { pageNumber: number }

export type TopicMemoriesClient = { read: typeof fetchTopicMemories; rate: typeof rateTopicMemory }
const DEFAULT_CLIENT: TopicMemoriesClient = { read: fetchTopicMemories, rate: rateTopicMemory }

type TopicMemoriesDialogState = {
	query: UseQueryResult<TopicMemoriesResult>
	pageNumber: number
	isSaving: boolean
	hasSaveError: boolean
	hasReachedSavedTakeawayLimit: boolean
	// both platform adapters call the same paging and feedback actions
	handleRate: (item: TopicMemory, feedback: TopicMemoryFeedback) => void
	handleOpenPage: (page: number) => void
}

/** Manages Journal paging and feedback for both apps. */
export function useTopicMemories({
	topicId,
	userId,
	onTakeawayRemoved,
	client = DEFAULT_CLIENT,
}: {
	topicId: string
	userId: string | null
	onTakeawayRemoved?: () => void
	client?: TopicMemoriesClient
}): TopicMemoriesDialogState {
	// a different viewer cannot reuse the previous viewer's page
	const [pageNumber, setPageNumber] = useState(1)
	const query = useQuery({
		queryKey: ["topic-journal", userId, topicId, pageNumber],
		queryFn: async ({ signal }) => ({
			...(await client.read({ topicId, page: pageNumber, signal })),
			pageNumber,
		}),
		gcTime: 0,
		placeholderData: (previous, previousQuery) => {
			const key = previousQuery?.queryKey
			return key?.[1] === userId && key?.[2] === topicId ? previous : undefined
		},
	})
	// an out-of-band removal can make the page disappear during a background refresh
	const loadedPage = query.data?.pageNumber
	const pageCount = query.data?.pageCount
	useEffect(() => {
		if (loadedPage === pageNumber && pageCount !== undefined) {
			const lastPage = Math.max(1, pageCount)
			if (pageNumber > lastPage) {
				setPageNumber(lastPage)
			}
		}
	}, [loadedPage, pageCount, pageNumber])

	// refresh after a vote moves a takeaway or removes the page's last row
	const mutation = useMutation({
		mutationFn: ({ id, feedback }: { id: string; feedback: TopicMemoryFeedback }) =>
			client.rate({ topicId, topicMemoryId: id, feedback }),
		onSuccess: async ({ status }, { feedback }) => {
			if (status === "savedTakeawayLimit") {
				return
			}
			// a downvote without a correction removes the takeaway from the header count
			if (feedback.rating === "down" && !feedback.note?.trim()) {
				onTakeawayRemoved?.()
			}
			await query.refetch()
		},
	})

	return {
		query,
		pageNumber,
		isSaving: mutation.isPending,
		hasSaveError: mutation.isError,
		hasReachedSavedTakeawayLimit: mutation.data?.status === "savedTakeawayLimit",
		handleRate: (item, feedback) => mutation.mutate({ id: item.id, feedback }),
		handleOpenPage: setPageNumber,
	}
}
