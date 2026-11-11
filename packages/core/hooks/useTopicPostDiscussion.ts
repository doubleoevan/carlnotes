// a Topic Post's discussion card state: the regenerate form, its note for the hosts, the start of a recording, and the
// reads of the post while one records
import { showClientError } from "@carlnotes/client/apiClient"
import { sendTopicPostDiscussionRegeneration } from "@carlnotes/client/topicPostClient"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { useEffect, useState } from "react"
import { startLimitedPoll } from "../lib/limitedPoll"
import { TOPIC_POST_DISCUSSION_LABELS, TOPIC_POST_DISCUSSION_POLL_MS } from "../lib/topicPostDiscussions"
import { useStableCallback } from "./useStableCallback"

// how long a page reads its post again for one recording before it stops: longer than the worker's attempts and
// backoffs together
const TOPIC_POST_DISCUSSION_POLL_LIMIT_MS = 45 * 60 * 1000

/**
 * Reads a Topic Post again on an interval while the app is focused and online, until the poll's time limit, and
 * returns the call that stops the reads.
 */
export function startTopicPostDiscussionPoll(readTopicPostAgain: () => void): () => void {
	return startLimitedPoll({
		read: readTopicPostAgain,
		pollMs: TOPIC_POST_DISCUSSION_POLL_MS,
		limitMs: TOPIC_POST_DISCUSSION_POLL_LIMIT_MS,
	})
}

// the post, and the read of it again that a started or finished recording asks for
type UseTopicPostDiscussionOptions = {
	topicPost: Pick<TopicPostResponse, "id" | "discussion">
	onChanged: () => void
	// the regenerate request. a test and a story pass a fake
	sendRegeneration?: typeof sendTopicPostDiscussionRegeneration
}

// the regenerate form's state and its calls
type TopicPostDiscussion = {
	isFormOpen: boolean
	openForm: () => void
	closeForm: () => void
	// the note for the hosts, and the start of a recording
	hint: string
	setHint: (hint: string) => void
	isSending: boolean
	regenerate: () => Promise<void>
}

/**
 * Holds a Topic Post's discussion card: the regenerate form with its note, and the start of a recording. While a
 * discussion records, the post is read again on an interval, so the card shows the recording once it is stored. The
 * reads pause while the app is in the background, and stop at their time limit.
 */
export function useTopicPostDiscussion({
	topicPost,
	onChanged,
	sendRegeneration = sendTopicPostDiscussionRegeneration,
}: UseTopicPostDiscussionOptions): TopicPostDiscussion {
	const [isFormOpen, setIsFormOpen] = useState(false)
	const [hint, setHint] = useState("")
	const [isSending, setIsSending] = useState(false)
	const readTopicPostAgain = useStableCallback(onChanged)

	// read the post again while a discussion records
	const isRecording = Boolean(topicPost.discussion?.isRecording)
	useEffect(() => {
		if (!isRecording) {
			return
		}
		return startTopicPostDiscussionPoll(readTopicPostAgain)
	}, [isRecording, readTopicPostAgain])

	// start a recording with the note, then close the form and read the post again. a rejection keeps the form
	const regenerate = async (): Promise<void> => {
		setIsSending(true)
		try {
			// the note goes only if it holds words
			await sendRegeneration(topicPost.id, hint.trim() || undefined)
			setIsFormOpen(false)
			setHint("")
			readTopicPostAgain()
		} catch (error) {
			// say why in the api's words, or in the fallback's
			showClientError(error instanceof Error ? error.message : TOPIC_POST_DISCUSSION_LABELS.regenerateError)
		} finally {
			setIsSending(false)
		}
	}
	// the form's state and its calls
	return {
		isFormOpen,
		openForm: () => setIsFormOpen(true),
		closeForm: () => setIsFormOpen(false),
		hint,
		setHint,
		isSending,
		regenerate,
	}
}
