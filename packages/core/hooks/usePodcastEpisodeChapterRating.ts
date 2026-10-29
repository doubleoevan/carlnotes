import { sendPodcastEpisodeChapterRating } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisodeChapter } from "@carlnotes/contracts/podcast"
import { useEffect, useRef, useState } from "react"

/**
 * Optimistically saves an orphan chapter's rating, with duplicate protection and rollback.
 */
export function usePodcastEpisodeChapterRating(
	podcastEpisodeId: string,
	chapter: PodcastEpisodeChapter,
): {
	rating: PodcastEpisodeChapter["rating"]
	isSaving: boolean
	rate: (rating: PodcastEpisodeChapter["rating"]) => Promise<void>
} {
	// track the rating and retire saves after unmount
	const [rating, setRating] = useState(chapter.rating)
	const [isSaving, setIsSaving] = useState(false)
	const isRatingPending = useRef(false)
	const isMounted = useRef(true)
	useEffect(() => {
		isMounted.current = true
		return () => {
			isMounted.current = false
		}
	}, [])
	const rate = async (nextRating: PodcastEpisodeChapter["rating"]): Promise<void> => {
		if (isRatingPending.current) {
			return
		}
		// display the choice immediately and allow only one outstanding save
		isRatingPending.current = true
		setIsSaving(true)
		const previousRating = rating
		setRating(nextRating)
		try {
			const isRatingSaved = await sendPodcastEpisodeChapterRating({
				podcastEpisodeId,
				position: chapter.position,
				rating: nextRating,
			})
			if (!isRatingSaved && isMounted.current) {
				setRating(previousRating)
			}
		} catch {
			if (isMounted.current) {
				setRating(previousRating)
			}
		} finally {
			isRatingPending.current = false
			if (isMounted.current) {
				setIsSaving(false)
			}
		}
	}
	return { rating, isSaving, rate }
}
