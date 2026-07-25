import type { TopicResponse } from "@shared/contracts"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
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
	const handleDelete = async () => {
		try {
			await sendTopicDelete(topic.id)
			await onTopicDeleted()
		} catch (error) {
			console.error("topic delete failed", error)
		}
	}
	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle>Delete this topic?</DialogTitle>
				<DialogDescription>
					{`'${topic.name}' with its ${topic.findings.length} findings and ${topic.scans.length} scans go with it.`}
				</DialogDescription>
				{/* keep it or destroy it */}
				<DialogFooter>
					<Button variant="ghost" onClick={onClose}>
						Keep it
					</Button>
					<Button variant="destructive" onClick={handleDelete}>
						Delete topic
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
