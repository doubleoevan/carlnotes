import { sendDeleteTopic } from "@carlnotes/client/topicClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"

/**
 * The Delete Topic confirmation dialog
 */
export function DeleteTopicDialog({
	topic,
	onClose,
	onTopicDeleted,
}: {
	topic: TopicResponse
	onClose: () => void
	onTopicDeleted: () => Promise<void>
}) {
	// delete the topic, then let the parent refresh the feed and navigate home
	const handleDelete = async (): Promise<void> => {
		try {
			await sendDeleteTopic(topic.id)
			await onTopicDeleted()
		} catch (error) {
			console.error("topic delete failed", error)
		}
	}
	return (
		<ConfirmDialog
			title="Delete this topic?"
			confirmLabel="Delete topic"
			cancelLabel="Keep it"
			onConfirm={handleDelete}
			onClose={onClose}
		>
			{`'${topic.name}' and its ${topic.findings.length} findings and ${topic.scans.length} scans go with it.`}
		</ConfirmDialog>
	)
}
