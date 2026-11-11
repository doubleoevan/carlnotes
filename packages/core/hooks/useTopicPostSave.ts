// a Topic Post's save: its title and body go out together once typing stops, one save at a time, at the version the
// last save returned. a newer version or a post past its edit time stops the saves
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

// the post the editor opened on, and what a save that failed for any reason but a newer version reports
type UseTopicPostSaveOptions = {
	topicPost: Pick<TopicPostResponse, "id" | "title" | "html" | "version" | "publishedAt">
	onSaveError: (topicPostWriteFailure: TopicPostWriteFailure) => void
	// the save request. a test and a story pass a fake
	saveDraft?: typeof saveTopicPost
}

// where the post stands, its title, and the calls that feed the save
type TopicPostSave = {
	status: NoteSaveStatus
	hasConflict: boolean
	title: string
	setTitle: (title: string) => void
	// take the editor's latest body, and save it once typing stops
	scheduleHtml: (html: string) => void
	// take the editor's own rendering of the stored body as the saved one
	setSavedHtml: (html: string) => void
	// send a waiting save now. resolves to whether the server holds the latest draft
	saveNow: () => Promise<boolean>
	// take the post a reload fetched, which ends the conflict
	resolveConflict: (topicPost: Pick<TopicPostResponse, "title" | "html" | "version">) => void
}

/**
 * Saves a Topic Post's title and body as its author edits them, and sends a waiting save at once as the editor
 * unmounts or the app leaves the foreground.
 */
export function useTopicPostSave({
	topicPost,
	onSaveError,
	saveDraft = saveTopicPost,
}: UseTopicPostSaveOptions): TopicPostSave {
	// what the editor shows: the title, where the post stands, and whether a newer version holds it
	const [title, setTitleState] = useState(topicPost.title)
	const [status, setStatus] = useState<NoteSaveStatus>("saved")
	const [hasConflict, setHasConflict] = useState(false)

	// the latest draft, the draft the server holds with its version, the save on its way, and the waiting timer
	const draftRef = useRef<TopicPostDraft>({ title: topicPost.title, html: topicPost.html })
	const savedRef = useRef({ title: topicPost.title, html: topicPost.html, version: topicPost.version })
	const sendingRef = useRef<Promise<boolean> | null>(null)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isStoppedRef = useRef(false)
	const handleSaveError = useStableCallback(onSaveError)

	// whether the server holds the latest draft
	function isDraftSaved(): boolean {
		return draftRef.current.title === savedRef.current.title && draftRef.current.html === savedRef.current.html
	}

	// cancel a waiting save
	function clearTimer(): void {
		if (timerRef.current) {
			clearTimeout(timerRef.current)
			timerRef.current = null
		}
	}

	// send one draft at the stored version, and keep what the server returns
	async function sendDraft(topicPostDraft: TopicPostDraft): Promise<boolean> {
		setStatus("saving")
		const topicPostSaveResult = await saveDraft(topicPost.id, {
			...topicPostDraft,
			version: savedRef.current.version,
		})

		// a kept save moves the stored draft and its version
		if (topicPostSaveResult.status === "saved") {
			savedRef.current = { ...topicPostDraft, version: topicPostSaveResult.version }
			setStatus(isDraftSaved() ? "saved" : "saving")
			return true
		}

		// a newer version and a post past its edit time stop the saves
		setStatus("unsaved")
		isStoppedRef.current = topicPostSaveResult.status === "conflict" || topicPostSaveResult.status === "locked"

		// a newer version shows its notice, and any other failure is reported
		if (topicPostSaveResult.status === "conflict") {
			setHasConflict(true)
		} else {
			handleSaveError(topicPostSaveResult)
		}
		return false
	}

	// send the latest draft unless the server holds it, after any save on its way
	async function saveNow(): Promise<boolean> {
		clearTimer()
		while (sendingRef.current) {
			await sendingRef.current
		}

		// a stopped save sends nothing, and a saved draft has nothing to send
		if (isStoppedRef.current) {
			return false
		}
		if (isDraftSaved()) {
			return true
		}

		// one save at a time, so each goes out at the version the one before it returned
		const sending = sendDraft({ ...draftRef.current })
		sendingRef.current = sending
		const isSaved = await sending
		sendingRef.current = null
		return isSaved
	}

	// take an edit, and save it once typing stops
	function scheduleSave(topicPostDraft: TopicPostDraft): void {
		draftRef.current = topicPostDraft
		clearTimer()
		if (isStoppedRef.current) {
			setStatus("unsaved")
			return
		}

		// an edit back to the saved draft has nothing to send
		if (isDraftSaved() && !sendingRef.current) {
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
		hasConflict,
		title,
		setTitle: (nextTitle) => {
			setTitleState(nextTitle)
			scheduleSave({ ...draftRef.current, title: nextTitle })
		},
		scheduleHtml: (html) => scheduleSave({ ...draftRef.current, html }),
		setSavedHtml: (html) => {
			// the editor's own rendering of the stored body is no edit
			draftRef.current = { ...draftRef.current, html }
			savedRef.current = { ...savedRef.current, html }
		},
		saveNow,
		resolveConflict: (storedTopicPost) => {
			// the stored post replaces the draft, and the saves start again
			clearTimer()
			draftRef.current = { title: storedTopicPost.title, html: storedTopicPost.html }
			savedRef.current = { ...draftRef.current, version: storedTopicPost.version }
			isStoppedRef.current = false
			setTitleState(storedTopicPost.title)
			setHasConflict(false)
			setStatus("saved")
		},
	}
}
