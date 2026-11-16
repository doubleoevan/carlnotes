// the editable note shares the finding rating's request and reloads from the server on reopen
import { authClient } from "@carlnotes/client/authClient"
import { fetchTopicFindingRatingNote } from "@carlnotes/client/topicFindingClient"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import type { Rating } from "../components/RatingThumbs"
import { toRatingFeedback } from "../components/RatingWithFeedback"

/** Loads only the signed-in rater's own note and keeps edits available while the field is open. */
export function useFindingRatingNote(
	findingId: string,
	rating: Rating,
): {
	note: string
	setNote: (note: string) => void
	toFeedback: (pressed: Rating) => { rating: Rating; note?: string }
} {
	// the account and the Finding both scope cached and unsent words
	const userId = authClient().useSession().data?.user.id ?? null
	const [draft, setDraft] = useState<{ userId: string | null; findingId: string; note: string }>()
	const query = useQuery({
		queryKey: ["finding-rating-note", userId, findingId],
		queryFn: ({ signal }) => fetchTopicFindingRatingNote(findingId, signal),
		enabled: Boolean(userId && rating),
		gcTime: 0,
	})
	// show the saved note only while its rating is selected
	const savedNote = rating ? (query.data ?? null) : null
	const editedNote = draft?.userId === userId && draft?.findingId === findingId ? draft.note : undefined
	const note = editedNote ?? savedNote ?? ""
	return {
		note,
		setNote: (nextNote) => setDraft({ userId, findingId, note: nextNote }),
		toFeedback: (pressed) => {
			// omit unread notes so changing a thumb preserves the server's value
			if (rating && !query.isSuccess && editedNote === undefined && pressed !== null) {
				return { rating: pressed }
			}

			// discard the draft when clearing the vote
			const feedback = toRatingFeedback({ rating, pressed, savedNote, note })
			if (feedback.rating === null) {
				setDraft(undefined)
			}
			return feedback
		},
	}
}
