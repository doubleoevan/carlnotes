import { ReactionRow, type ReactionRowAdapterProps } from "@carlnotes/core/components/ReactionRow"
import type { ReactionClient } from "@carlnotes/core/hooks/useReactions"
import { useState } from "react"
import { SOCIAL_ELEMENTS } from "@/components/social/socialElements"
import { callMcpViewTool, openMcpViewLink, toMcpViewData, toMcpViewSiteUrl, toToolResultText } from "./mcpViewHost"

// an MCP view saves a reaction through its tool, which returns the new reaction summary beside its text
const MCP_VIEW_REACTION_CLIENT: ReactionClient = {
	save: async (target, reactionType) => {
		const toolResult = await callMcpViewTool("save_reaction", {
			target_kind: target.kind,
			target_id: target.id,
			reaction_type: reactionType,
		}).catch(() => null)
		const reactionSummary = toolResult && !toolResult.isError && toMcpViewData(toolResult._meta).reactionSummary
		return reactionSummary
			? { status: "saved", summary: reactionSummary }
			: { status: "failed", message: toolResult ? toToolResultText(toolResult.content) : null }
	},
}

/**
 * The shared reaction row in an MCP view, with the web's elements: a save calls the tool through the host, a
 * visitor's press opens sign-up on the site, and an error shows under the row.
 */
export function McpViewReactionRow({
	target,
	summary,
	isSignedIn,
	className = "mt-3 flex flex-col gap-1",
}: Omit<ReactionRowAdapterProps, "onSummaryChange"> & { className?: string }) {
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	return (
		<div className={className}>
			<ReactionRow
				target={target}
				summary={summary}
				isSignedIn={isSignedIn}
				onSignIn={() => void openMcpViewLink(toMcpViewSiteUrl("/sign-up"))}
				onError={setErrorMessage}
				client={MCP_VIEW_REACTION_CLIENT}
				elements={SOCIAL_ELEMENTS}
			/>
			{errorMessage && (
				<p role="alert" className="text-destructive text-sm">
					{errorMessage}
				</p>
			)}
		</div>
	)
}
