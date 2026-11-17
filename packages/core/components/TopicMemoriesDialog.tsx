import {
	TOPIC_MEMORY_NOTE_LIMIT,
	TOPIC_MEMORY_PAGE_SIZE,
	type TopicMemory,
	type TopicMemoryFeedback,
	toTopicMemoryDisplayText,
} from "@carlnotes/contracts/topicMemories"
import { TOPIC_MEMORY_SAVED_LIMIT } from "@carlnotes/contracts/topicMemoryWork"
import { type ComponentType, type ReactNode, useState } from "react"
import { type TopicMemoriesClient, useTopicMemories } from "../hooks/useTopicMemories"
import type { Rating } from "./RatingThumbs"
import { type RatingWithFeedbackProps, toRatingFeedback } from "./RatingWithFeedback"

export const JOURNAL_BUTTON_ICON = "📙"
export const JOURNAL_BUTTON_LABEL = "Journal"
export const TOPIC_MEMORIES_TITLE = "Topic Takeaways 🧠"
const TOPIC_MEMORIES_EMPTY = "Carl hasn’t written any takeaways yet. Check back after a brew."

// the dialog's content uses the same slots for platform controls and announcements
export type TopicMemoriesDialogElements = {
	List: ComponentType<{ children: ReactNode; isLoading: boolean }>
	Row: ComponentType<{ text: string; itemNumber: number; isLast: boolean; children?: ReactNode }>
	Skeleton: ComponentType<{ text?: string; itemNumber: number; isLast: boolean; canRate?: boolean }>
	Rating: ComponentType<RatingWithFeedbackProps>
	Message: ComponentType<{ children: string; isError?: boolean }>
	Retry: ComponentType<{ onPress: () => void }>
	Pagination: ComponentType<{ pageNumber: number; pageCount: number; onOpenPage: (page: number) => void }>
}

/** Formats the visible total for the Journal heading on web and mobile. */
export function toTopicMemoriesTitle(topicMemoryCount = 0): string {
	// name a single item in the singular
	const title = topicMemoryCount === 1 ? "Topic Takeaway 🧠" : TOPIC_MEMORIES_TITLE
	return `${topicMemoryCount} ${title}`
}

/** Displays both Brew diary counts beside the Journal on either platform. */
export function toScanHistoryCounts(entryCount: number, topicMemoryCount = 0): string {
	// format each count in the singular when it is one
	const entries = `${entryCount} ${entryCount === 1 ? "entry" : "entries"}`
	return `${entries} · ${topicMemoryCount} ${topicMemoryCount === 1 ? "takeaway" : "takeaways"}`
}

/** Reads and renders the Journal content inside the web dialog or native sheet. */
export function TopicMemoriesDialog({
	topicId,
	userId,
	elements,
	canRateTopicMemories,
	onTopicMemoryRemoved,
	client,
}: {
	topicId: string
	userId: string | null
	elements: TopicMemoriesDialogElements
	canRateTopicMemories?: boolean
	onTopicMemoryRemoved?: () => void
	client?: TopicMemoriesClient
}) {
	// read the open dialog's page and show any feedback errors
	const journal = useTopicMemories({ topicId, userId, onTopicMemoryRemoved, client })
	const { List, Row, Rating, Skeleton, Message, Retry, Pagination } = elements
	const { data, isPending, isPlaceholderData, isError, refetch } = journal.query
	const isLoading = isPending || isPlaceholderData
	const pageCount = data?.pageCount ?? 0
	const canShowLoadingFeedback = data?.canRate ?? canRateTopicMemories

	// a failed refresh keeps existing rows. a failed initial read offers a retry
	if (!data && !isLoading) {
		return <Retry onPress={() => void refetch()} />
	}
	if (!isLoading && pageCount === 0) {
		return <Message>{TOPIC_MEMORIES_EMPTY}</Message>
	}
	// keep the old page's row heights and the pager while the next page loads
	const skeletons =
		data?.items.map(({ id, text, factDate }) => ({ id, text: toTopicMemoryDisplayText(text, factDate) })) ??
		Array.from({ length: TOPIC_MEMORY_PAGE_SIZE }, (_, index) => ({ id: String(index), text: undefined }))
	const firstItemNumber = ((data?.pageNumber ?? journal.pageNumber) - 1) * TOPIC_MEMORY_PAGE_SIZE + 1
	return (
		<>
			{/* show one page of topic memories or its loading shapes */}
			<List isLoading={isLoading}>
				{isLoading
					? skeletons.map(({ id, text }, index) => (
							<Skeleton
								key={id}
								text={text}
								itemNumber={firstItemNumber + index}
								isLast={index === skeletons.length - 1}
								canRate={canShowLoadingFeedback}
							/>
						))
					: data?.items.map((item, index) => (
							<Row
								key={item.id}
								text={toTopicMemoryDisplayText(item.text, item.factDate)}
								itemNumber={firstItemNumber + index}
								isLast={index === data.items.length - 1}
							>
								{data.canRate && (
									<TopicMemoryRating
										key={item.note ?? ""}
										item={item}
										isSaving={journal.isSaving}
										RatingControl={Rating}
										onRate={journal.handleRate}
									/>
								)}
							</Row>
						))}
			</List>
			{/* Feedback can reorder a topic memory or remove it from the list. */}
			{journal.hasReachedSavedTopicMemoryLimit && (
				<Message isError>{`You can save up to ${TOPIC_MEMORY_SAVED_LIMIT} takeaways per Topic.`}</Message>
			)}
			{journal.hasSaveError && <Message isError>Carl couldn’t save that feedback. Try again.</Message>}
			{isError && <Retry onPress={() => void refetch()} />}
			{pageCount > 1 && (
				<Pagination pageNumber={journal.pageNumber} pageCount={pageCount} onOpenPage={journal.handleOpenPage} />
			)}
		</>
	)
}

// keep each draft beside its own topic memory until the reader submits it
function TopicMemoryRating({
	item,
	isSaving,
	RatingControl,
	onRate,
}: {
	item: TopicMemory
	isSaving: boolean
	RatingControl: ComponentType<RatingWithFeedbackProps>
	onRate: (item: TopicMemory, feedback: TopicMemoryFeedback) => void
}) {
	const [note, setNote] = useState(item.note ?? "")
	// pressing an already selected thumb saves an edit or clears the unchanged vote
	const handleRate = (rating: Rating): void => {
		onRate(item, toRatingFeedback({ rating: item.rating, pressed: rating, savedNote: item.note, note }))
	}
	return (
		<RatingControl
			label="Feedback for Carl (optional)"
			value={note}
			maxLength={TOPIC_MEMORY_NOTE_LIMIT}
			rating={item.rating}
			isDisabled={isSaving}
			isInputDisabled={isSaving}
			ariaLabelSuffix={` for takeaway: ${item.text}`}
			onChange={setNote}
			onRate={handleRate}
		/>
	)
}
