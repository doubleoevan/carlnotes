import type { McpTopicCardResult } from "@carlnotes/contracts/mcpCards"
import { useState } from "react"
import { TopicDraftCard } from "@/components/chat/TopicDraftCard"
import { Button } from "@/components/primitives/button"
import { callCardTool } from "./cardHost"

/**
 * The topic card: the chat's topic card for an edit_topic or create_topic result. A preview shows the edit over the
 * topic as it stands, with a Save button that calls edit_topic again with the same edit and the preview's confirmation.
 */
export function TopicCard({
	mcpTopicCardResult,
	editTopicArguments,
}: {
	mcpTopicCardResult: McpTopicCardResult
	// the edit the tool was called with, which Save sends again
	editTopicArguments: Record<string, unknown> | null
}) {
	// the result the card shows, which a save replaces, and the save's own rejection
	const [shownTopicCardResult, setShownTopicCardResult] = useState(mcpTopicCardResult)
	const [isSaving, setIsSaving] = useState(false)
	const [saveRejection, setSaveRejection] = useState<string | null>(null)

	// save the previewed edit with its confirmation, and show the saved topic or what stopped the save
	const handleSave = async (): Promise<void> => {
		if (shownTopicCardResult.status !== "confirmRequired") {
			return
		}
		setIsSaving(true)
		try {
			const editTopicResult = await callCardTool("edit_topic", {
				...editTopicArguments,
				confirmation: shownTopicCardResult.confirmation,
			})
			const savedTopicCardResult = editTopicResult.structuredContent as McpTopicCardResult | undefined
			if (editTopicResult.isError || !savedTopicCardResult) {
				setSaveRejection(toToolResultText(editTopicResult.content))
				return
			}
			setShownTopicCardResult(savedTopicCardResult)
		} finally {
			setIsSaving(false)
		}
	}
	if (!shownTopicCardResult.afterTopicDraft) {
		return null
	}
	return (
		<div className="bg-card rounded-lg border">
			<TopicDraftCard
				topicDraft={shownTopicCardResult.afterTopicDraft}
				topicId={shownTopicCardResult.topicId}
				isTopicEditProposed={shownTopicCardResult.status === "confirmRequired"}
			/>
			{/* the Save button under a preview that needs the user's agreement, and what stopped a save */}
			{shownTopicCardResult.status === "confirmRequired" && (
				<div className="flex items-center justify-end gap-3 border-t px-3 py-2">
					{saveRejection && <p className="text-destructive flex-1 text-sm">{saveRejection}</p>}
					<Button size="sm" disabled={isSaving} onClick={() => void handleSave()}>
						Save
					</Button>
				</div>
			)}
		</div>
	)
}

// a tool result's text, joined
function toToolResultText(content: unknown): string {
	if (!Array.isArray(content)) {
		return ""
	}
	return content.map((contentBlock) => (contentBlock as { text?: string }).text ?? "").join(" ")
}
