import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { PROFILE_RANK_OPTION_LABELS } from "@carlnotes/core/lib/rankDialog"
import { isTopicPostFeaturable, TOPIC_POST_LABELS, type TopicPostBodyImageReport } from "@carlnotes/core/lib/topicPosts"
import { Flag, NotebookPen, Pencil, Share as ShareIcon, Trash2 } from "lucide-react-native"
import type { PageActionOption } from "@/components/search/PageActionMenu"

// the published Topic Post, what a report of each body image names, and the calls that open its share sheet, its
// editor, its author's rank sheet, its delete confirmation, and a body image's report
type ToTopicPostPageActionOptionsOptions = {
	topicPost: TopicPostResponse
	bodyImageReports: TopicPostBodyImageReport[]
	// the calls each option makes
	onShare: () => void
	onEdit: () => void
	onRankProfile: () => void
	onDelete: () => void
	onReportBodyImage: (report: TopicPostBodyImageReport) => void
}

/**
 * Returns the actions menu's options: Share, Edit post for its author, Featured posts for the author of a published
 * Topic Post of a public topic, Delete post for whoever may delete it, and a Report image option for each body image.
 */
export function toTopicPostPageActionOptions({
	topicPost,
	bodyImageReports,
	onShare,
	onEdit,
	onRankProfile,
	onDelete,
	onReportBodyImage,
}: ToTopicPostPageActionOptionsOptions): PageActionOption[] {
	return [
		{ label: TOPIC_POST_LABELS.share, icon: ShareIcon, onSelect: onShare },
		...(topicPost.isAuthor ? [{ label: TOPIC_POST_LABELS.edit, icon: Pencil, onSelect: onEdit }] : []),
		// the author of a published Topic Post of a public topic arranges their own profile's featured Topic Posts from
		// inside the Topic Post, as on the web
		...(topicPost.isAuthor && isTopicPostFeaturable(topicPost)
			? [{ label: PROFILE_RANK_OPTION_LABELS.posts, icon: NotebookPen, onSelect: onRankProfile }]
			: []),
		...(topicPost.canDelete ? [{ label: TOPIC_POST_LABELS.delete, icon: Trash2, onSelect: onDelete }] : []),
		...bodyImageReports.map((report) => ({
			label: report.optionLabel,
			icon: Flag,
			onSelect: () => onReportBodyImage(report),
		})),
	]
}
