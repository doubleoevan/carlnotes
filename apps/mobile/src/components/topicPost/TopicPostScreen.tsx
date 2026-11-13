import { showClientError } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import { deleteTopicPost, fetchTopicPost } from "@carlnotes/client/topicPostClient"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import {
	TopicPostPage as SharedTopicPostPage,
	type TopicPostPageElements,
} from "@carlnotes/core/components/TopicPostPage"
import { useTopicPostView } from "@carlnotes/core/hooks/useTopicPostView"
import { PROFILE_RANK_OPTION_LABELS, toTopicPostRankedItem } from "@carlnotes/core/lib/rankDialog"
import { EDIT_IMAGE_DIALOG_TITLES } from "@carlnotes/core/lib/topicImageEditor"
import {
	isTopicPostEditorShown,
	isTopicPostPinnable,
	TOPIC_POST_DELETE,
	TOPIC_POST_LABELS,
	type TopicPostBodyImageReport,
	toTopicPostBodyImageReports,
	toTopicPostDeleteDescription,
	toTopicPostEditableImage,
	toTopicPostImageReport,
	toTopicPostShare,
} from "@carlnotes/core/lib/topicPosts"
import { registerChatTopicPost, useRegisterChatTopicPost } from "@carlnotes/core/stores/topicPostChatStore"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { router, useFocusEffect, useLocalSearchParams, usePathname } from "expo-router"
import { Flag, NotebookPen, Pencil, Share as ShareIcon, Trash2, X } from "lucide-react-native"
import { type ReactNode, useCallback, useState } from "react"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { DetailsLine } from "@/components/common/DetailsLine"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { ProfileRankDialog } from "@/components/common/RankDialog"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog"
import { ViewerCountLine } from "@/components/common/ViewerCountLine"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { NoteEditorScreen } from "@/components/note/NoteEditorScreen"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import type { PageActionOption } from "@/components/search/PageActionMenu"
import { ShareTopicSheet } from "@/components/share/ShareTopic"
import { CommentMentionBadge } from "@/components/social/CommentMentionBadge"
import { ReactionRow } from "@/components/social/ReactionRow"
import { SocialSection } from "@/components/social/SocialSection"
import { EditImageDialog } from "@/components/topic/EditImageDialog"
import { TopicByline } from "@/components/topic/TopicByline"
import { TopicHeaderImage } from "@/components/topic/TopicImageButton"
import { TopicPostBody } from "./TopicPostBody"
import { TOPIC_POST_DISCUSSION_CARD_ELEMENTS } from "./TopicPostDiscussionCard"
import { TopicPostEditor } from "./TopicPostEditor"
import { TopicPostInfo } from "./TopicPostInfo"

// the app's elements: the image beside the title and the byline, as on the podcast episode screen, the note's
// typography on a card, and the app's editor
export const TOPIC_POST_PAGE_ELEMENTS: TopicPostPageElements = {
	Header: ({ image, title, children }) => (
		<View className="mt-4 flex-row items-start gap-4">
			{image}
			<View className="min-w-0 flex-1">
				{title}
				{children}
			</View>
		</View>
	),
	Image: ({ image, name, isPending, onEdit }) => (
		<TopicHeaderImage
			image={image}
			name={name}
			isPending={isPending}
			editLabel={EDIT_IMAGE_DIALOG_TITLES.topicPost}
			onEdit={onEdit}
		/>
	),
	Title: ({ info, mentionBadge, children }) => (
		<View className="min-w-0 flex-row items-start gap-2">
			<Text accessibilityRole="header" className="min-w-0 flex-1 font-display text-2xl leading-tight">
				{children}
			</Text>
			{info}
			{mentionBadge}
		</View>
	),
	Info: TopicPostInfo,
	MentionBadge: ({ commentMentions }) => <CommentMentionBadge commentMentions={commentMentions} place="title" />,
	BylineRow: ({ children }) => (
		<View className="mt-1.5 flex-row flex-wrap items-center gap-x-3 gap-y-1">{children}</View>
	),
	Byline: ({ author, topic }) => (
		<View className="min-w-0 shrink flex-row flex-wrap items-center gap-x-1">
			<TopicByline topic={{ owner: author, teamLink: null }} label={TOPIC_POST_LABELS.writtenBy} isPage />
			<Text className="text-sm text-muted-foreground">
				{"for "}
				<AnchorLink asChild href={topic.path} accessibilityLabel={`Open ${topic.name}`}>
					<Text className="text-sm text-link">{topic.name}</Text>
				</AnchorLink>
			</Text>
		</View>
	),
	Reactions: ReactionRow,
	DetailsLine: (props) => <DetailsLine className="mt-1" {...props} />,
	discussionElements: TOPIC_POST_DISCUSSION_CARD_ELEMENTS,
	Body: TopicPostBody,
	Editor: TopicPostEditor,
}

/**
 * A Topic Post's screen: the published Topic Post with its comment thread, or the editor on its author's draft.
 */
export function TopicPostScreen() {
	// scope the Topic Post to its account and route identity
	const { topicId, topicPostId } = useLocalSearchParams<{ topicId: string; topicPostId: string }>()
	const { data: session } = authClient().useSession()
	const queryClient = useQueryClient()
	const queryKey = ["topic-post", session?.user.id ?? null, topicPostId]
	const query = useQuery({
		queryKey,
		queryFn: () => fetchTopicPost(topicPostId),
		gcTime: 0,
		staleTime: 0,
		retry: false,
	})
	const { refetch } = query
	const [isEditing, setIsEditing] = useState(false)
	const [isDeleteOpen, setIsDeleteOpen] = useState(false)
	const [isImageDialogOpen, setIsImageDialogOpen] = useState(false)
	const [isShareOpen, setIsShareOpen] = useState(false)
	const [isProfileRankDialogOpen, setIsProfileRankDialogOpen] = useState(false)
	const [openBodyImageReport, setOpenBodyImageReport] = useState<TopicPostBodyImageReport | null>(null)

	// the count that the comment thread reports as it stands, for the details line
	const [commentCount, setCommentCount] = useState<number | null>(null)

	// read the Topic Post again as the screen takes focus, except over an open editor, whose draft a read would
	// replace
	const topicPost = query.data

	// the chat launcher opens the private chat of the Topic Post's topic, which asks about this Topic Post, on its
	// screen
	const publishedTopicPost = topicPost?.publishedAt ? topicPost : null
	useRegisterChatTopicPost(publishedTopicPost)

	// name the Topic Post again each time its screen takes focus. another Topic Post's screen that closed above it
	// named none
	const { id: chatTopicPostId, title: chatTopicPostTitle, path: chatTopicPostPath } = publishedTopicPost ?? {}
	const chatTopicPostTopicId = publishedTopicPost?.topicId
	useFocusEffect(
		useCallback(() => {
			if (chatTopicPostId && chatTopicPostTitle !== undefined && chatTopicPostPath && chatTopicPostTopicId) {
				registerChatTopicPost({
					id: chatTopicPostId,
					title: chatTopicPostTitle,
					path: chatTopicPostPath,
					topicId: chatTopicPostTopicId,
				})
			}
		}, [chatTopicPostId, chatTopicPostTitle, chatTopicPostPath, chatTopicPostTopicId]),
	)
	// send a published Topic Post's view once per app runtime
	useTopicPostView(publishedTopicPost?.id)

	const isEditorShown = Boolean(topicPost && isTopicPostEditorShown(topicPost, isEditing))
	useFocusEffect(
		useCallback(() => {
			if (!isEditorShown) {
				void refetch()
			}
		}, [refetch, isEditorShown]),
	)

	// the Topic Post's skeleton while it loads, the retryable error, or the line for a Topic Post that did not load
	if (!topicPost) {
		return (
			<PageScreen title="Post" contentClassName="mt-0 gap-4" header={<View />}>
				{query.isPending && <PageSkeleton kind="topicPost" pageElements={TOPIC_POST_PAGE_ELEMENTS} />}
				{query.isError && (
					<LoadFailedNotice
						className="py-4"
						message={TOPIC_POST_LABELS.loadError}
						retryLabel="Retry post"
						onRetry={() => void refetch()}
					/>
				)}
				{topicPost === null && <Text className="mt-6 text-sm text-muted-foreground">{TOPIC_POST_LABELS.missing}</Text>}
			</PageScreen>
		)
	}

	// the shared page, which shows the editor or the Topic Post
	const topicPostPage = (
		<SharedTopicPostPage
			key={`${session?.user.id ?? "visitor"}/${topicPost.id}`}
			topicPost={topicPost}
			isSignedIn={Boolean(session)}
			isEditing={isEditing}
			commentCount={commentCount}
			onPublished={(publishedTopicPost) => queryClient.setQueryData(queryKey, publishedTopicPost)}
			onEditDone={() => {
				setIsEditing(false)
				void refetch()
			}}
			onChanged={() => void refetch()}
			onEditImage={topicPost.canEditImage ? () => setIsImageDialogOpen(true) : undefined}
			elements={TOPIC_POST_PAGE_ELEMENTS}
		>
			{/* the Topic Post's comment thread, whose first page came with the Topic Post */}
			<SocialSection
				target={{ kind: "post", id: topicPost.id }}
				firstPage={topicPost.commentThread}
				isSignedIn={Boolean(session)}
				topicId={topicPost.topicId}
				isTopicOwner={topicPost.isTopicOwner}
				onCommentCountChange={setCommentCount}
			/>
			{/* a published Topic Post's visitors, the page's last line */}
			<TopicPostVisitorsLine topicPost={topicPost} />
		</SharedTopicPostPage>
	)
	if (isEditorShown) {
		return <TopicPostEditorScreen closePath={`/topics/${topicId}`}>{topicPostPage}</TopicPostEditorScreen>
	}

	// the actions menu, whose options open the share sheet, the editor, the rank sheet, the delete confirmation, and
	// each body image's report
	const options = toTopicPostPageOptions({
		topicPost,
		bodyImageReports: toTopicPostBodyImageReports(topicPost, Boolean(session)),
		onShare: () => setIsShareOpen(true),
		onEdit: () => setIsEditing(true),
		onRankProfile: () => setIsProfileRankDialogOpen(true),
		onDelete: () => setIsDeleteOpen(true),
		onReportBodyImage: setOpenBodyImageReport,
	})

	// delete the Topic Post and its thread, then open its topic's screen. a failed delete keeps the screen
	const handleDelete = async (): Promise<void> => {
		if (await deleteTopicPost(topicPost.id)) {
			router.replace(`/topics/${topicPost.topicId}`)
		} else {
			showClientError(TOPIC_POST_LABELS.deleteError)
		}
	}
	return (
		<PageScreen
			title="Post"
			onRefresh={() => void refetch()}
			options={options}
			report={toTopicPostImageReport(topicPost)}
			header={<View />}
			contentClassName="mt-0 gap-2"
		>
			{topicPostPage}
			{/* the actions menu's share sheet, the topic's own with this Topic Post shared in the topic's place */}
			{isShareOpen && <ShareTopicSheet {...toTopicPostShare(topicPost)} onClose={() => setIsShareOpen(false)} />}
			{/* the image sheet that a press on an editor's header image opens */}
			{isImageDialogOpen && (
				<EditImageDialog
					editableImage={toTopicPostEditableImage(topicPost)}
					onImageChanged={() => void refetch()}
					onClose={() => setIsImageDialogOpen(false)}
				/>
			)}
			{/* the author's own featured Topic Posts, with this Topic Post offered a place */}
			{isProfileRankDialogOpen && (
				<ProfileRankDialog
					rankedNoun="posts"
					pageItem={toTopicPostRankedItem(topicPost)}
					onClose={() => setIsProfileRankDialogOpen(false)}
				/>
			)}
			{/* a body image's report, which reads the Topic Post again as it closes */}
			<TopicPostBodyImageReportSheet
				report={openBodyImageReport}
				onClose={() => {
					setOpenBodyImageReport(null)
					void refetch()
				}}
			/>
			{/* the confirmation of the actions menu's delete */}
			{isDeleteOpen && (
				<ConfirmDialog
					title={TOPIC_POST_DELETE.title}
					confirmLabel={TOPIC_POST_DELETE.confirmLabel}
					cancelLabel={TOPIC_POST_DELETE.cancelLabel}
					onConfirm={handleDelete}
					onClose={() => setIsDeleteOpen(false)}
				>
					{toTopicPostDeleteDescription(topicPost.title)}
				</ConfirmDialog>
			)}
		</PageScreen>
	)
}

// the published Topic Post, what a report of each body image names, and the calls that open its share sheet, its
// editor, its author's rank sheet, its delete confirmation, and a body image's report
type ToTopicPostPageOptionsOptions = {
	topicPost: TopicPostResponse
	bodyImageReports: TopicPostBodyImageReport[]
	onShare: () => void
	onEdit: () => void
	onRankProfile: () => void
	onDelete: () => void
	onReportBodyImage: (report: TopicPostBodyImageReport) => void
}

// the actions menu: Share, which opens the Topic Post's share sheet as the info popup's Share does, Edit post for its
// author, Featured posts for the author of a published Topic Post of a public topic, Delete post for whoever may delete
// it, and a report of each body image. Report image follows them
function toTopicPostPageOptions({
	topicPost,
	bodyImageReports,
	onShare,
	onEdit,
	onRankProfile,
	onDelete,
	onReportBodyImage,
}: ToTopicPostPageOptionsOptions): PageActionOption[] {
	return [
		{ label: TOPIC_POST_LABELS.share, icon: ShareIcon, onSelect: onShare },
		...(topicPost.isAuthor
			? [
					{
						label: TOPIC_POST_LABELS.edit,
						icon: Pencil,
						onSelect: onEdit,
					},
				]
			: []),
		...toProfileRankOptions(topicPost, onRankProfile),
		...(topicPost.canDelete ? [{ label: TOPIC_POST_LABELS.delete, icon: Trash2, onSelect: onDelete }] : []),
		...bodyImageReports.map((report) => ({
			label: report.optionLabel,
			icon: Flag,
			onSelect: () => onReportBodyImage(report),
		})),
	]
}

// the author of a published Topic Post of a public topic arranges their own profile's featured Topic Posts from
// inside the Topic Post, as on the web
function toProfileRankOptions(topicPost: TopicPostResponse, onSelect: () => void): PageActionOption[] {
	return topicPost.isAuthor && isTopicPostPinnable(topicPost)
		? [{ label: PROFILE_RANK_OPTION_LABELS.posts, icon: NotebookPen, onSelect }]
		: []
}

// the editor's screen, as the note's, with the close control over the editor
function TopicPostEditorScreen({ closePath, children }: { closePath: string; children: ReactNode }) {
	return (
		<NoteEditorScreen contentClassName="px-4 pt-4">
			{/* return to the Topic Post's topic. the editor sends a waiting save as it closes */}
			<View className="mb-2 flex-row items-center justify-end">
				<AnchorLink href={closePath} shouldDismissTo accessibilityLabel="Close post" asChild>
					<Button accessibilityLabel="Close post" variant="ghost" size="icon">
						<Icon as={X} className="size-4 text-foreground" />
					</Button>
				</AnchorLink>
			</View>
			{children}
		</NoteEditorScreen>
	)
}

// the report sheet of the body image the actions menu chose
function TopicPostBodyImageReportSheet({
	report,
	onClose,
}: {
	report: TopicPostBodyImageReport | null
	onClose: () => void
}) {
	if (!report) {
		return null
	}
	return (
		<ReportIssueDialog
			subjectKind={report.subjectKind}
			subjectId={report.subjectId}
			subjectLabel={report.subjectLabel}
			onClose={onClose}
		/>
	)
}

// a published Topic Post's Visitors line, read while the Topic Post's screen is the active route. a draft has none
function TopicPostVisitorsLine({ topicPost }: { topicPost: TopicPostResponse }) {
	const pathname = usePathname()
	if (!topicPost.publishedAt) {
		return null
	}
	return (
		<ViewerCountLine
			viewerCountPage={{ kind: "topicPost", id: topicPost.id, isPublic: topicPost.isTopicPublic }}
			isActiveRoute={pathname === `/topics/${topicPost.topicId}/posts/${topicPost.id}`}
		/>
	)
}
