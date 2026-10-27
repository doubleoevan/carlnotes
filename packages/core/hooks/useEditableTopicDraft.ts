import { fetchTopicPage } from "@carlnotes/client/topicClient"
import { type EditableTopicFields, toEditableTopicDraft } from "@carlnotes/contracts/topicEdits"
import type { TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { useEffect, useMemo, useState } from "react"
import {
	toCurrentChatGuard,
	useChatConversation,
	useIsEditingTopic,
	useProposedTopicEdit,
	useTopicChangeCount,
} from "../stores/chatConversationStore"

// the topic a read returned, with the topic id it was read for
type TopicReadResult = {
	conversationKey: string
	accountId: string | null
	topicId: string
	topic: EditableTopicFields | null
}

// the topic draft that the card shows, and whether the card shows carl's proposal instead of the saved topic
export type EditableTopicDraft = { topicDraft: TopicDraft; isTopicEditProposed: boolean }

/**
 * Returns the editable Topic draft with its proposed changes.
 */
export function useEditableTopicDraft(topicId: string | null): EditableTopicDraft | null {
	const [readTopic, setReadTopic] = useState<TopicReadResult | null>(null)
	const { accountId, chatId } = useChatConversation()
	const conversationKey = JSON.stringify(chatId)
	const isEditingTopic = useIsEditingTopic(topicId)
	const proposedTopicEdit = useProposedTopicEdit(topicId)
	const topicChangeCount = useTopicChangeCount(topicId)
	// biome-ignore lint/correctness/useExhaustiveDependencies: the change count is the signal to read the topic again
	useEffect(() => {
		// skip the read until this topic is the one being edited
		if (!topicId || !isEditingTopic) {
			setReadTopic(null)
			return
		}
		// mark this read as the current topic's
		let isCurrentTopic = true
		const isCurrentChat = toCurrentChatGuard()
		// read the topic page, keeping its topic only for a user the page says may edit it
		fetchTopicPage(topicId)
			.then((topicPage) => {
				if (isCurrentTopic && isCurrentChat()) {
					const isEditable = topicPage.status === "visible" && topicPage.topic.canEdit
					setReadTopic({ conversationKey, accountId, topicId, topic: isEditable ? topicPage.topic : null })
				}
			})
			.catch(() => {
				// drop the card on a failed read, so it never claims a topic this read could not confirm
				if (isCurrentTopic && isCurrentChat()) {
					setReadTopic(null)
				}
			})
		// clear isCurrentTopic on the way out, dropping a read that finishes after the user leaves the topic
		return () => {
			isCurrentTopic = false
		}
	}, [topicId, isEditingTopic, topicChangeCount, accountId, conversationKey])

	// the topic the last read returned, and only while the chat is still on the topic it came from
	const topic =
		readTopic?.topicId === topicId &&
		readTopic.accountId === accountId &&
		readTopic.conversationKey === conversationKey &&
		isEditingTopic
			? readTopic.topic
			: null
	// rebuild the topic draft only when the read or proposal changes, so the card holds its scroll
	return useMemo(() => {
		if (!topic) {
			return null
		}
		// build the topic draft twice, as the topic is saved and as the proposal would leave it.
		// the two drafts match once the proposal is saved
		const savedTopicDraft = toEditableTopicDraft(topic)
		const proposedTopicDraft = toEditableTopicDraft(topic, proposedTopicEdit)

		// the card reads as proposed if the proposal changes the topic draft
		const isTopicEditProposed = JSON.stringify(proposedTopicDraft) !== JSON.stringify(savedTopicDraft)
		const topicDraft = isTopicEditProposed ? proposedTopicDraft : savedTopicDraft
		return { topicDraft, isTopicEditProposed }
	}, [topic, proposedTopicEdit])
}
