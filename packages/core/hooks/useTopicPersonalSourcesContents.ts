// keep one decrypted entry page only while personal sources is open
import {
	fetchTopicPersonalSources,
	fetchTopicPersonalSourcesEntries,
	sendDeletePersonalSourceEntry,
} from "@carlnotes/client/personalSourcesClient"
import type { PersonalSourceEntry, PersonalSourceEntryPage } from "@carlnotes/contracts/personalSources"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { toPersonalSourcesEntryCount } from "../lib/personalSourcesCopy"

export type TopicPersonalSourcesContentsState = {
	totalEntryCount?: number
	entryOffset: number
	page?: PersonalSourceEntryPage
	isLoading: boolean
	hasError: boolean
	isPending: boolean
	pageNumber: number
	pageCount: number
	confirmation: PersonalSourceEntry | null
	error: string | null
	retry: () => void
	openPage: (pageNumber: number) => void
	removeEntry: (entry: PersonalSourceEntry) => void
	cancel: () => void
	confirm: () => Promise<void>
}

/**
 * Loads current sender-only items and refreshes their counts after confirmed deletion.
 */
export function useTopicPersonalSourcesContents({
	userId,
	topicId,
}: {
	userId: string
	topicId: string
}): TopicPersonalSourcesContentsState {
	// retain only the requested page number rather than previous decrypted pages
	const [requestedPage, setRequestedPage] = useState(1)
	const [confirmation, setConfirmation] = useState<PersonalSourceEntry | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isPending, setIsPending] = useState(false)
	const isMutating = useRef(false)
	const queryClient = useQueryClient()
	const metadata = useQuery({
		queryKey: ["topic-personalSources", userId, topicId],
		queryFn: ({ signal }) => fetchTopicPersonalSources(topicId, signal),
		gcTime: 0,
		refetchInterval: 15_000,
	})
	const page = useQuery({
		queryKey: ["topic-personalSources-entries", userId, topicId, requestedPage],
		queryFn: ({ signal }) => fetchTopicPersonalSourcesEntries({ topicId, pageNumber: requestedPage, signal }),
		gcTime: 0,
		refetchInterval: 15_000,
	})
	// stay on the remaining page after deletion or expiry, including subsequent polling refreshes
	const receivedPageNumber = page.data?.pagination?.pageNumber
	useEffect(() => {
		if (receivedPageNumber !== undefined && receivedPageNumber !== requestedPage) {
			setRequestedPage(receivedPageNumber)
		}
	}, [receivedPageNumber, requestedPage])

	// refresh item pages and counts after a successful delete
	const confirm = async (): Promise<void> => {
		if (!confirmation || isMutating.current) {
			return
		}
		isMutating.current = true
		setIsPending(true)
		setError(null)
		try {
			await sendDeletePersonalSourceEntry({ topicId, entryId: confirmation.id })
			setConfirmation(null)
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["topic-personalSources-entries", userId, topicId] }),
				queryClient.invalidateQueries({ queryKey: ["topic-personalSources", userId, topicId] }),
			])
		} catch {
			setError("Could not delete that entry. Try again.")
		} finally {
			isMutating.current = false
			setIsPending(false)
		}
	}
	return {
		totalEntryCount:
			page.data?.pagination?.totalEntryCount ??
			(metadata.data ? toPersonalSourcesEntryCount(metadata.data) : undefined),
		entryOffset: page.data?.pagination?.entryOffset ?? 0,
		page: page.data,
		isLoading: page.isPending,
		hasError: page.isError,
		isPending,
		pageNumber: page.data?.pagination?.pageNumber ?? requestedPage,
		pageCount: page.data?.pagination?.pageCount ?? 1,
		confirmation,
		error,
		confirm,
		retry: () => {
			void page.refetch()
		},
		openPage: setRequestedPage,
		removeEntry: setConfirmation,
		cancel: () => setConfirmation(null),
	}
}
