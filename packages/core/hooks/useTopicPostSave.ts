// a Topic Post's save: its title and body go out together once typing stops, one save at a time, at the version the
// last save returned. a newer version is saved over once
import { saveTopicPost } from "@carlnotes/client/topicPostClient"
import type { TopicPostResponse, TopicPostWriteFailure } from "@carlnotes/contracts/topicPosts"
import { focusManager } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import type { NoteSaveStatus } from "./useNoteBodySave"
import { useStableCallback } from "./useStableCallback"

// how long after the last change a draft's save goes out, and a published post's, whose every save is classified
const TOPIC_POST_DRAFT_SAVE_DEBOUNCE_MS = 1000
const TOPIC_POST_PUBLISHED_SAVE_DEBOUNCE_MS = 10_000

/**
 * Returns how long after the last change a Topic Post's save goes out: a second for a draft, and ten for a published
 * post.
 */
export function toTopicPostSaveDebounceMs(topicPost: Pick<TopicPostResponse, "publishedAt">): number {
	return topicPost.publishedAt ? TOPIC_POST_PUBLISHED_SAVE_DEBOUNCE_MS : TOPIC_POST_DRAFT_SAVE_DEBOUNCE_MS
}

// a Topic Post's title and body as its editor holds them
type TopicPostDraft = { title: string; html: string }

// the post the editor opened on, and what a failed save reports
type UseTopicPostSaveOptions = {
	topicPost: Pick<TopicPostResponse, "id" | "title" | "html" | "version" | "publishedAt">
	onSaveError: (topicPostWriteFailure: TopicPostWriteFailure) => void
	// the save request. a test and a story pass a fake
	saveTopicPostDraft?: typeof saveTopicPost
}

// where the post stands, its title, and the calls that feed the save
type TopicPostSave = {
	status: NoteSaveStatus
	title: string
	setTitle: (title: string) => void
	// take the editor's latest body, and save it once typing stops
	scheduleHtml: (html: string) => void
	// take the editor's own rendering of the stored body as the saved one
	setSavedHtml: (html: string) => void
	// send a waiting save now. resolves to whether the server holds the latest draft
	saveNow: () => Promise<boolean>
}

/**
 * Saves a Topic Post's title and body as its author edits them, and sends a waiting save at once as the editor
 * unmounts or the app leaves the foreground.
 */
export function useTopicPostSave({
	topicPost,
	onSaveError,
	saveTopicPostDraft = saveTopicPost,
}: UseTopicPostSaveOptions): TopicPostSave {
	// what the editor shows: the title and where the post stands
	const [title, setTitleState] = useState(topicPost.title)
	const [status, setStatus] = useState<NoteSaveStatus>("saved")

	// the latest draft, the draft the server holds with its version, the save on its way, and the waiting timer
	const topicPostDraftRef = useRef<TopicPostDraft>({ title: topicPost.title, html: topicPost.html })
	const savedTopicPostDraftRef = useRef<{ title: string | null; html: string | null; version: number }>({
		title: topicPost.title,
		html: topicPost.html,
		version: topicPost.version,
	})
	const sendingRef = useRef<Promise<boolean> | null>(null)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const handleSaveError = useStableCallback(onSaveError)

	// whether the server holds the latest draft
	function isTopicPostDraftSaved(): boolean {
		return (
			topicPostDraftRef.current.title === savedTopicPostDraftRef.current.title &&
			topicPostDraftRef.current.html === savedTopicPostDraftRef.current.html
		)
	}

	// cancel a waiting save
	function clearTimer(): void {
		if (timerRef.current) {
			clearTimeout(timerRef.current)
			timerRef.current = null
		}
	}

	// send one draft at the stored version, and keep what the server returns. a newer version, from the author's other
	// tab or device or an admin's removal of an image, is saved over once, and the server keeps a removed image out
	async function sendTopicPostDraft(topicPostDraft: TopicPostDraft, isRetry = false): Promise<boolean> {
		setStatus("saving")
		const topicPostSaveResult = await saveTopicPostDraft(topicPost.id, {
			...topicPostDraft,
			version: savedTopicPostDraftRef.current.version,
		})

		// a kept save moves the stored draft and its version
		if (topicPostSaveResult.status === "saved") {
			savedTopicPostDraftRef.current = { ...topicPostDraft, version: topicPostSaveResult.version }
			setStatus(isTopicPostDraftSaved() ? "saved" : "saving")
			return true
		}

		// a newer version is saved over at that version. its text is unknown, so no draft counts as saved until a save
		// is kept
		if (topicPostSaveResult.status === "conflict" && topicPostSaveResult.version !== null && !isRetry) {
			savedTopicPostDraftRef.current = { title: null, html: null, version: topicPostSaveResult.version }
			return sendTopicPostDraft(topicPostDraft, true)
		}

		// any other failure is reported
		setStatus("unsaved")
		handleSaveError(topicPostSaveResult)
		return false
	}

	// send the latest draft unless the server holds it, after any save on its way
	async function saveNow(): Promise<boolean> {
		clearTimer()
		while (sendingRef.current) {
			await sendingRef.current
		}

		// a saved draft has nothing to send
		if (isTopicPostDraftSaved()) {
			return true
		}

		// one save at a time, so each goes out at the version the one before it returned
		const sending = sendTopicPostDraft({ ...topicPostDraftRef.current })
		sendingRef.current = sending
		const isSaved = await sending
		sendingRef.current = null
		return isSaved
	}

	// take an edit, and save it once typing stops
	function scheduleSave(topicPostDraft: TopicPostDraft): void {
		topicPostDraftRef.current = topicPostDraft
		clearTimer()

		// an edit back to the saved draft has nothing to send
		if (isTopicPostDraftSaved() && !sendingRef.current) {
			setStatus("saved")
			return
		}

		// show the save as on its way, and send it once typing stops
		setStatus("saving")
		timerRef.current = setTimeout(() => void saveNow(), toTopicPostSaveDebounceMs(topicPost))
	}

	// send a waiting save as the editor unmounts
	const flushSave = useStableCallback(() => void saveNow())
	useEffect(() => flushSave, [flushSave])

	// send a waiting save as the app leaves the foreground
	useEffect(() => {
		return focusManager.subscribe((isFocused) => {
			if (!isFocused) {
				flushSave()
			}
		})
	}, [flushSave])

	// where the post stands, and the calls that feed the save
	return {
		status,
		title,
		setTitle: (nextTitle) => {
			setTitleState(nextTitle)
			scheduleSave({ ...topicPostDraftRef.current, title: nextTitle })
		},
		scheduleHtml: (html) => scheduleSave({ ...topicPostDraftRef.current, html }),
		setSavedHtml: (html) => {
			// the editor's own rendering of the stored body is no edit
			topicPostDraftRef.current = { ...topicPostDraftRef.current, html }
			savedTopicPostDraftRef.current = { ...savedTopicPostDraftRef.current, html }
		},
		saveNow,
	}
}
