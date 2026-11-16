// read only the open Journal's current page and keep unsent feedback after a failed write
import { fetchTopicMemories, rateTopicMemory } from "@carlnotes/client/topicMemoriesClient"
import {
	type TopicMemoriesPage,
	type TopicMemory,
	type TopicMemoryFeedback,
	toTopicMemoryPageNumber,
} from "@carlnotes/contracts/topicMemories"
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
	hasReachedSavedTopicMemoryLimit: boolean
	// both platform adapters call the same paging and feedback actions
	handleRate: (item: TopicMemory, feedback: TopicMemoryFeedback) => void
	handleOpenPage: (page: number) => void
}

/** Manages Journal paging and feedback for both apps. */
export function useTopicMemories({
	topicId,
	userId,
	onTopicMemoryRemoved,
	client = DEFAULT_CLIENT,
}: {
	topicId: string
	userId: string | null
	onTopicMemoryRemoved?: () => void
	client?: TopicMemoriesClient
}): TopicMemoriesDialogState {
	// a different viewer cannot reuse the previous viewer's page
	const [pageNumber, setPageNumber] = useState(1)
	const query = useQuery({
		queryKey: ["topic-journal", userId, topicId, pageNumber],
		queryFn: async ({ signal }) => {
			// number the rows using the page served by the current count
			const page = await client.read({ topicId, page: pageNumber, signal })
			return { ...page, pageNumber: toTopicMemoryPageNumber(pageNumber, page.pageCount) }
		},
		gcTime: 0,
		placeholderData: (previous, previousQuery) => {
			const key = previousQuery?.queryKey
			return key?.[1] === userId && key?.[2] === topicId ? previous : undefined
		},
	})
	// keep the next refresh on the page the server served after a removal or regroup
	const shownPage = query.isPlaceholderData ? pageNumber : (query.data?.pageNumber ?? pageNumber)
	useEffect(() => {
		if (shownPage !== pageNumber) {
			setPageNumber(shownPage)
		}
	}, [shownPage, pageNumber])

	// refresh after a vote moves a topic memory or removes the page's last row
	const mutation = useMutation({
		mutationFn: ({ id, feedback }: { id: string; feedback: TopicMemoryFeedback }) =>
			client.rate({ topicId, topicMemoryId: id, feedback }),
		onSuccess: async ({ status }, { feedback }) => {
			if (status === "savedTopicMemoryLimit") {
				return
			}
			// a downvote without a correction removes the topic memory from the header count
			if (feedback.rating === "down" && !feedback.note?.trim()) {
				onTopicMemoryRemoved?.()
			}
			await query.refetch()
		},
	})

	return {
		query,
		pageNumber: shownPage,
		isSaving: mutation.isPending,
		hasSaveError: mutation.isError,
		hasReachedSavedTopicMemoryLimit: mutation.data?.status === "savedTopicMemoryLimit",
		handleRate: (item, feedback) => mutation.mutate({ id: item.id, feedback }),
		handleOpenPage: setPageNumber,
	}
}
