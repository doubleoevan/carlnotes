import type { TopicDraft } from "@shared/contracts"
import { useEffect, useMemo, useState } from "react"
import { fetchTopicPage } from "@/clients/topicClient"
import { type EditableTopicFields, toEditableTopicDraft } from "@/components/chat/editableTopicDraft"
import { useIsEditingTopic, useProposedTopicEdit, useTopicChangeCount } from "@/stores/chatPanelStore"

// the topic a read returned, with the topic id it was read for
type TopicReadResult = { topicId: string; topic: EditableTopicFields | null }

// the topic the card shows, and whether it reads as carl proposed it instead of as it is saved
export type EditableTopicDraft = { topicDraft: TopicDraft; isTopicEditProposed: boolean }

/**
 * The topic being edited with carl, as a topic draft, with whatever he proposed changing previewed over it.
 * Read when the edit starts and again after each of his saves. Null when no edit is under way, for a user who may not
 * edit the topic, and for a topic the page cannot show.
 */
export function useEditableTopicDraft(topicId: string | null): EditableTopicDraft | null {
	const [readTopic, setReadTopic] = useState<TopicReadResult | null>(null)
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
		// read the topic page, keeping its topic only for a user the page says may edit it
		fetchTopicPage(topicId)
			.then((topicPage) => {
				if (isCurrentTopic) {
					const isEditable = topicPage.status === "visible" && topicPage.topic.canEdit
					setReadTopic({ topicId, topic: isEditable ? topicPage.topic : null })
				}
			})
			.catch((error) => {
				// drop the card on a failed read, so it never claims a topic this read could not confirm
				if (isCurrentTopic) {
					setReadTopic(null)
				}
				console.error("editable topic read failed", error)
			})
		// clear isCurrentTopic on the way out, dropping a read that finishes after the user leaves the topic
		return () => {
			isCurrentTopic = false
		}
	}, [topicId, isEditingTopic, topicChangeCount])

	// the topic the last read returned, and only while the chat is still on the topic it came from
	const topic = readTopic?.topicId === topicId ? readTopic.topic : null
	// rebuild the topic draft only when the read or proposal changes, so the card holds its scroll
	return useMemo(() => {
		if (!topic) {
			return null
		}
		// build the topic draft twice, as the topic is saved and as the proposal would leave it.
		// the two drafts match once the proposal is saved
		const savedTopicDraft = toEditableTopicDraft(topic)
		const proposedTopicDraft = toEditableTopicDraft(topic, proposedTopicEdit)
		const isTopicEditProposed = JSON.stringify(proposedTopicDraft) !== JSON.stringify(savedTopicDraft)
		return { topicDraft: isTopicEditProposed ? proposedTopicDraft : savedTopicDraft, isTopicEditProposed }
	}, [topic, proposedTopicEdit])
}
