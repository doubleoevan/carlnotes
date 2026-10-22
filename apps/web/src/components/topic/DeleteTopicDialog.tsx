import { sendDeleteTopic } from "@carlnotes/client/topicClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { toast } from "sonner"
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
	// delete the topic, then let the parent refresh the feed and navigate home. a failed delete keeps the dialog open
	// and says so in a toast
	const handleDelete = async (): Promise<void> => {
		try {
			await sendDeleteTopic(topic.id)
		} catch (error) {
			console.error("topic delete failed", error)
			toast.error("That topic didn't get deleted. Try again.")
			return
		}
		await onTopicDeleted()
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
