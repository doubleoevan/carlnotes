import type { TopicResponse } from "@shared/contracts"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { sendTopicDelete } from "@/lib/topicClient"

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
			await sendTopicDelete(topic.id)
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
