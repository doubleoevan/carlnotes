import { CommentThread } from "@carlnotes/core/components/CommentThread"
import type { CommentThreadAdapterProps } from "@carlnotes/core/components/SocialSection"
import type { SocialElements } from "@carlnotes/core/lib/socialElements"
import { COMMENT_THREAD_HEADING } from "@carlnotes/core/lib/socialLabels"
import { useState } from "react"
import { SOCIAL_ELEMENTS } from "@/components/social/socialElements"
import { openMcpViewLink, toMcpViewSiteUrl } from "./mcpViewHost"

// the web's elements of the thread, with no edit, delete, or report control, which have no tool
const MCP_VIEW_SOCIAL_ELEMENTS: SocialElements = { ...SOCIAL_ELEMENTS, RowControl: () => null, Report: () => null }

/**
 * The shared comment thread in an MCP view, with the web's elements. Its reads, its posts, and its reactions go
 * through the hot take and reaction tools by the MCP view's fetch, a visitor's press opens sign-up on the site, and an
 * error shows under the thread.
 */
export function McpViewCommentThread(props: CommentThreadAdapterProps) {
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	return (
		<section aria-label={COMMENT_THREAD_HEADING} className="flex flex-col gap-1">
			<CommentThread
				{...props}
				onSignIn={() => void openMcpViewLink(toMcpViewSiteUrl("/sign-up"))}
				onError={setErrorMessage}
				onReport={ignoreReport}
				elements={MCP_VIEW_SOCIAL_ELEMENTS}
			/>
			{errorMessage && (
				<p role="alert" className="text-destructive text-sm">
					{errorMessage}
				</p>
			)}
		</section>
	)
}

// the thread draws no report control, so no report opens
function ignoreReport(): void {}
