import type { ChatLinkPreview } from "@carlnotes/contracts/chat"
import { apiClient } from "./apiClient"
import { showFailedWrite } from "./clientWrite"

// feedback callers can retain unsent words after a rejected write
type SendFindingFeedbackOptions = { findingId: string; feedback: string; shouldThrowOnError?: boolean }

/**
 * Records a user's exact words about a finding.
 */
export async function sendFindingFeedback({
	findingId,
	feedback,
	shouldThrowOnError,
}: SendFindingFeedbackOptions): Promise<void> {
	const request = apiClient().api["topic-findings"][":id"].feedback.$post({
		param: { id: findingId },
		json: { feedback },
	})
	await showFailedWrite({ request, action: "finding feedback", isBackground: true, shouldThrowOnError })
}

/**
 * Returns a Finding's link preview, or null for a missing preview or unsuccessful response.
 */
export async function fetchTopicFindingLinkPreview(findingId: string): Promise<ChatLinkPreview | null> {
	// return no preview when the request is rejected
	const response = await apiClient().api["topic-findings"][":id"]["link-preview"].$get({ param: { id: findingId } })
	if (!response.ok) {
		return null
	}
	return ((await response.json()) as { linkPreview: ChatLinkPreview | null }).linkPreview
}

// a finding write may reject after reporting its failure
type FindingWriteOptions = { findingId: string; shouldThrowOnError?: boolean }
export type SendTopicFindingRatingOptions = FindingWriteOptions & { rating: "up" | "down" | null }
export type SendTopicFindingConsumedOptions = FindingWriteOptions & { isConsumed: boolean }
export type SendTopicFindingBookmarkOptions = FindingWriteOptions & { isBookmarked: boolean }
export type SendTopicFindingOpenedOptions = FindingWriteOptions

/**
 * Sets or clears a finding's rating.
 */
export async function sendTopicFindingRating({
	findingId,
	rating,
	shouldThrowOnError,
}: SendTopicFindingRatingOptions): Promise<void> {
	await showFailedWrite({
		request: apiClient().api["topic-findings"][":id"].rating.$post({ param: { id: findingId }, json: { rating } }),
		action: "rate topic finding",
		shouldThrowOnError,
	})
}

/**
 * Marks a finding consumed or unread for the current user.
 */
export async function sendTopicFindingConsumed({
	findingId,
	isConsumed,
	shouldThrowOnError,
}: SendTopicFindingConsumedOptions): Promise<void> {
	await showFailedWrite({
		request: apiClient().api["topic-findings"][":id"].consume.$post({ param: { id: findingId }, json: { isConsumed } }),
		action: "mark topic finding consumed",
		shouldThrowOnError,
	})
}

/**
 * Sets the current user's bookmark on a finding.
 */
export async function sendTopicFindingBookmark({
	findingId,
	isBookmarked,
	shouldThrowOnError,
}: SendTopicFindingBookmarkOptions): Promise<void> {
	await showFailedWrite({
		request: apiClient().api["topic-findings"][":id"].bookmark.$post({
			param: { id: findingId },
			json: { isBookmarked },
		}),
		action: "bookmark topic finding",
		shouldThrowOnError,
	})
}

/**
 * Records a finding open and marks it consumed, reporting failures only in the log.
 */
export async function sendTopicFindingOpened({
	findingId,
	shouldThrowOnError,
}: SendTopicFindingOpenedOptions): Promise<void> {
	await showFailedWrite({
		request: apiClient().api["topic-findings"][":id"].view.$post({ param: { id: findingId } }),
		action: "record topic finding view",
		isBackground: true,
		shouldThrowOnError,
	})
}
