import { showClientError } from "@carlnotes/client/apiClient"
import type { CommentReply } from "@carlnotes/contracts/social"
import { CommentThread as SharedCommentThread } from "@carlnotes/core/components/CommentThread"
import type { CommentThreadAdapterProps } from "@carlnotes/core/components/SocialSection"
import { useCommentThreadViewEvent } from "@carlnotes/core/hooks/useCommentThreadViewEvent"
import { toCommentReportProps } from "@carlnotes/core/lib/reportCopy"
import { useLocalSearchParams, usePathname } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog"
import { openSessionScreen } from "@/sessionReturnPath"
import { captureVisitEvent } from "@/visitAnalytics"
import { SOCIAL_ELEMENTS } from "./socialElements"

/**
 * Adapts the shared comment thread to the mobile app: a visitor's press opens sign-up and returns to this screen, an
 * error shows the way the app shows one, and a flag opens the report dialog, which can block the comment's author.
 * Its first showing sends one view event with ids and no text.
 */
export function CommentThread({ topicId, isTopicOwner, ...props }: CommentThreadAdapterProps) {
	const pathname = usePathname()
	const [reportedComment, setReportedComment] = useState<CommentReply | null>(null)

	// the Comment the screen's route names, which leads the thread
	const { comment: linkedCommentId } = useLocalSearchParams<{ comment?: string }>()
	useCommentThreadViewEvent({ target: props.target, topicId, isTopicOwner, captureVisitEvent })
	const commentReportProps = reportedComment && toCommentReportProps("comment", reportedComment)

	return (
		<View className="gap-1">
			<SharedCommentThread
				{...props}
				linkedCommentId={linkedCommentId}
				onSignIn={() => openSessionScreen({ screen: "/sign-up", returnPath: pathname, cta: "hot-take" })}
				onError={showClientError}
				onReport={setReportedComment}
				elements={SOCIAL_ELEMENTS}
			/>
			{commentReportProps && <ReportIssueDialog {...commentReportProps} onClose={() => setReportedComment(null)} />}
		</View>
	)
}
