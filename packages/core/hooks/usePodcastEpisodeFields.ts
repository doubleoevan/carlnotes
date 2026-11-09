// the Edit podcast form's state, shared by both apps: the title and description as typed, and their save

import { showClientError, showClientMessage } from "@carlnotes/client/apiClient"
import { sendPodcastEpisodeUpdate } from "@carlnotes/client/podcastEpisodeClient"
import { useState } from "react"
import { PODCAST_EPISODE_SAVE_FAILED_TEXT, PODCAST_EPISODE_SAVED_TEXT } from "../lib/podcastEpisodeEditor"

// the podcast episode the form edits, and what runs after a save
type UsePodcastEpisodeFieldsOptions = {
	podcastEpisode: { id: string; title: string | null; description: string | null }
	onPodcastEpisodeSaved: () => void
}

// the fields and their setters, whether a save is under way, whether a save found the title empty, and the save
type PodcastEpisodeFields = {
	// the fields as typed, with their setters
	title: string
	setTitle: (title: string) => void
	description: string
	setDescription: (description: string) => void
	// the save and its state
	isSaving: boolean
	isTitleMissing: boolean
	savePodcastEpisode: () => Promise<void>
}

/**
 * Holds the Edit podcast form's title and description. Save sends both, trimmed, and an empty title is not sent.
 */
export function usePodcastEpisodeFields({
	podcastEpisode,
	onPodcastEpisodeSaved,
}: UsePodcastEpisodeFieldsOptions): PodcastEpisodeFields {
	// the fields as typed, whether a save is under way, and whether a save found the title empty
	const [title, setTitle] = useState(podcastEpisode.title ?? "")
	const [description, setDescription] = useState(podcastEpisode.description ?? "")
	const [isSaving, setIsSaving] = useState(false)
	const [isTitleMissing, setIsTitleMissing] = useState(false)

	// save the fields, or mark the title if it is empty
	const savePodcastEpisode = async (): Promise<void> => {
		if (!title.trim()) {
			setIsTitleMissing(true)
			return
		}

		// send the trimmed fields, then show the saved message and call onPodcastEpisodeSaved, or show the error
		setIsSaving(true)
		try {
			await sendPodcastEpisodeUpdate(podcastEpisode.id, { title: title.trim(), description: description.trim() })
			showClientMessage(PODCAST_EPISODE_SAVED_TEXT)
			onPodcastEpisodeSaved()
		} catch (error) {
			// a rejection names its reason, and anything else says the save failed
			showClientError(error instanceof Error ? error.message : PODCAST_EPISODE_SAVE_FAILED_TEXT)
		} finally {
			setIsSaving(false)
		}
	}
	return {
		title,
		setTitle,
		description,
		setDescription,
		isSaving,
		isTitleMissing: isTitleMissing && !title.trim(),
		savePodcastEpisode,
	}
}
