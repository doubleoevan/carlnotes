import { SafeNoteText } from "@/components/topic/TopicScanRecap"

/**
 * The MCP view's chat Markdown, which renders a Carl reply through the safe note renderer, so the MCP view's script
 * holds no streaming renderer with its code highlighting, diagrams, and math. A link shows as text.
 */
export function ChatMarkdown({ markdown, className }: { markdown: string; className?: string }) {
	return (
		<div className={className ?? "space-y-1.5 text-sm leading-relaxed"}>
			<SafeNoteText note={markdown} />
		</div>
	)
}
