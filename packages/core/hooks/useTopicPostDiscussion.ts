// a Topic Post's discussion card state: the regenerate form, its note for the hosts, the start of a recording, and the
// reads of the post while one records
import { showClientError } from "@carlnotes/client/apiClient"
import { sendTopicPostDiscussionRegeneration } from "@carlnotes/client/topicPostClient"
import type { TopicPostDiscussionStatusRead } from "@carlnotes/contracts/statusReads"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { useEffect, useState } from "react"
import { startStatusPoll } from "../lib/statusPoll"
import { TOPIC_POST_DISCUSSION_LABELS, TOPIC_POST_DISCUSSION_POLL_MS } from "../lib/topicPostDiscussions"
import { useStableCallback } from "./useStableCallback"

// how long a page reads its post again for one recording before it stops: longer than the worker's attempts and
// backoffs together
const TOPIC_POST_DISCUSSION_POLL_LIMIT_MS = 45 * 60 * 1000

// the read of the discussion's status, null for a failed read, and the read of the post again
type StartTopicPostDiscussionPollOptions = {
	readDiscussionStatus: () => Promise<TopicPostDiscussionStatusRead | null>
	readTopicPostAgain: () => void
}

/**
 * Reads a Topic Post's discussion status on an interval while the app is focused and online, until the poll's time
 * limit, and reads the post again once the discussion leaves recording. A failed status read stops the poll. Returns
 * the call that stops the reads.
 */
export function startTopicPostDiscussionPoll({
	readDiscussionStatus,
	readTopicPostAgain,
}: StartTopicPostDiscussionPollOptions): () => void {
	return startStatusPoll({
		readStatus: readDiscussionStatus,
		isInProgress: ({ status }) => status === "recording",
		readPage: readTopicPostAgain,
		pollMs: TOPIC_POST_DISCUSSION_POLL_MS,
		limitMs: TOPIC_POST_DISCUSSION_POLL_LIMIT_MS,
	})
}

// the post, and the read of it again that a started or finished recording asks for. the page passes the read of the
// discussion's status, which the poll needs, and leaves it out while its screen is covered. a card without it, such
// as an MCP view's, does not poll
type UseTopicPostDiscussionOptions = {
	topicPost: Pick<TopicPostResponse, "id" | "discussion">
	onChanged: () => void
	readDiscussionStatus?: () => Promise<TopicPostDiscussionStatusRead | null>
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
	readDiscussionStatus,
	sendRegeneration = sendTopicPostDiscussionRegeneration,
}: UseTopicPostDiscussionOptions): TopicPostDiscussion {
	const [isFormOpen, setIsFormOpen] = useState(false)
	const [hint, setHint] = useState("")
	const [isSending, setIsSending] = useState(false)
	const readTopicPostAgain = useStableCallback(onChanged)

	// keep the latest status read, so a new callback never restarts the poll
	const readLatestDiscussionStatus = useStableCallback(async () => (await readDiscussionStatus?.()) ?? null)

	// read the discussion's status while it records, if the page passes the read
	const isRecording = Boolean(topicPost.discussion?.isRecording)
	const isPollEnabled = readDiscussionStatus !== undefined
	useEffect(() => {
		if (!(isRecording && isPollEnabled)) {
			return
		}
		return startTopicPostDiscussionPoll({
			readDiscussionStatus: readLatestDiscussionStatus,
			readTopicPostAgain,
		})
	}, [isRecording, isPollEnabled, readLatestDiscussionStatus, readTopicPostAgain])

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
