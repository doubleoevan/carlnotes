import type { CommentReply } from "@carlnotes/contracts/social"
import { CommentThread as SharedCommentThread } from "@carlnotes/core/components/CommentThread"
import type { CommentThreadAdapterProps } from "@carlnotes/core/components/SocialSection"
import { useCommentThreadViewEvent } from "@carlnotes/core/hooks/useCommentThreadViewEvent"
import { toCommentReportProps } from "@carlnotes/core/lib/reportCopy"
import { COMMENT_THREAD_HEADING } from "@carlnotes/core/lib/socialLabels"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog"
import { toSignupNavigation } from "@/components/session/signupPrompts"
import { useSearchParams } from "@/hooks/useSearchParams"
import { captureVisitEvent } from "@/lib/visitAnalytics"
import { SOCIAL_ELEMENTS } from "./socialElements"

/**
 * Adapts the shared comment thread to the web: a visitor's press opens sign-up, an error shows as a toast, and a flag
 * opens the report dialog, which can block the comment's author. Its first showing sends one view event with ids and
 * no text.
 */
export function CommentThread({ topicId, isTopicOwner, ...props }: CommentThreadAdapterProps) {
	const navigate = useNavigate()
	const [reportedComment, setReportedComment] = useState<CommentReply | null>(null)

	// the Comment the page's url names, which leads the thread
	const linkedCommentId = useSearchParams().get("comment") ?? undefined
	useCommentThreadViewEvent({ target: props.target, topicId, isTopicOwner, captureVisitEvent })
	const commentReportProps = reportedComment && toCommentReportProps("comment", reportedComment)

	return (
		<section aria-label={COMMENT_THREAD_HEADING} className="flex flex-col gap-1">
			<SharedCommentThread
				{...props}
				linkedCommentId={linkedCommentId}
				onSignIn={() => void navigate(toSignupNavigation("hot-take"))}
				onError={toast.error}
				onReport={setReportedComment}
				elements={SOCIAL_ELEMENTS}
			/>
			{commentReportProps && <ReportIssueDialog {...commentReportProps} onClose={() => setReportedComment(null)} />}
		</section>
	)
}
