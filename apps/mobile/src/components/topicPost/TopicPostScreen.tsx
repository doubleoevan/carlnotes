import { showClientError } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import { deleteTopicPost, fetchTopicPost } from "@carlnotes/client/topicPostClient"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import {
	TopicPostPage as SharedTopicPostPage,
	type TopicPostPageElements,
} from "@carlnotes/core/components/TopicPostPage"
import { useTopicPostView } from "@carlnotes/core/hooks/useTopicPostView"
import { toNoteLinkUrl } from "@carlnotes/core/lib/noteFormats"
import { PROFILE_RANK_OPTION_LABELS, toTopicPostRankedItem } from "@carlnotes/core/lib/rankDialog"
import { EDIT_IMAGE_DIALOG_TITLES } from "@carlnotes/core/lib/topicImageEditor"
import {
	isTopicPostEditorShown,
	isTopicPostPinnable,
	TOPIC_POST_DELETE,
	TOPIC_POST_LABELS,
	toTopicPostDeleteDescription,
	toTopicPostEditableImage,
	toTopicPostImageReport,
	toTopicPostShare,
} from "@carlnotes/core/lib/topicPosts"
import { useIsPodcastPlayerShown } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { registerChatTopicPost, useRegisterChatTopicPost } from "@carlnotes/core/stores/topicPostChatStore"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { router, useFocusEffect, useLocalSearchParams, usePathname } from "expo-router"
import { NotebookPen, Pencil, Share as ShareIcon, Trash2, X } from "lucide-react-native"
import { type ReactNode, useCallback, useState } from "react"
import { KeyboardAvoidingView, View } from "react-native"
import { AnchorLink, openExternalLink } from "@/components/common/AnchorLink"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { DetailsLine } from "@/components/common/DetailsLine"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { ProfileRankDialog } from "@/components/common/RankDialog"
import { ViewerCountLine } from "@/components/common/ViewerCountLine"
import { Header } from "@/components/layout/Header"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { NoteReader } from "@/components/note/NoteViewer"
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
import { useFontScaledSize } from "@/hooks/useFontScaledSize"
import { useIsKeyboardVisible } from "@/hooks/useIsKeyboardVisible"
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
	Image: ({ image, name, onEdit }) => (
		<TopicHeaderImage image={image} name={name} editLabel={EDIT_IMAGE_DIALOG_TITLES.topicPost} onEdit={onEdit} />
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
 * A Topic Post's screen: the published post with its comment thread, or the editor on its author's draft.
 */
export function TopicPostScreen() {
	// scope the post to its account and route identity
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

	// the count that the comment thread reports as it stands, for the details line
	const [commentCount, setCommentCount] = useState<number | null>(null)

	// read the post again as the screen takes focus, except over an open editor, whose draft a read would replace
	const topicPost = query.data

	// the chat launcher opens the private chat of the post's topic, which asks about this post, on its screen
	const publishedTopicPost = topicPost?.publishedAt ? topicPost : null
	useRegisterChatTopicPost(publishedTopicPost)

	// name the post again each time its screen takes focus. another post's screen that closed above it named none
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
	// send a published post's view once per app runtime
	useTopicPostView(publishedTopicPost?.id)

	const isEditorShown = Boolean(topicPost && isTopicPostEditorShown(topicPost, isEditing))
	useFocusEffect(
		useCallback(() => {
			if (!isEditorShown) {
				void refetch()
			}
		}, [refetch, isEditorShown]),
	)

	// the post's skeleton while it loads, the retryable error, or the line for a post that did not load
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

	// the shared page, which shows the editor or the post
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
			{/* the post's comment thread, whose first page came with the post */}
			<SocialSection
				target={{ kind: "post", id: topicPost.id }}
				firstPage={topicPost.commentThread}
				isSignedIn={Boolean(session)}
				topicId={topicPost.topicId}
				isTopicOwner={topicPost.isTopicOwner}
				onCommentCountChange={setCommentCount}
			/>
			{/* a published post's visitors, the page's last line */}
			<TopicPostVisitorsLine topicPost={topicPost} />
		</SharedTopicPostPage>
	)
	if (isEditorShown) {
		return <TopicPostEditorScreen closePath={`/topics/${topicId}`}>{topicPostPage}</TopicPostEditorScreen>
	}

	// the actions menu, whose options open the share sheet, the editor, the rank sheet, and the delete confirmation
	const options = toTopicPostPageOptions({
		topicPost,
		onShare: () => setIsShareOpen(true),
		onEdit: () => setIsEditing(true),
		onRankProfile: () => setIsProfileRankDialogOpen(true),
		onDelete: () => setIsDeleteOpen(true),
	})

	// delete the post and its thread, then open its topic's screen. a failed delete keeps the screen
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
			{/* the actions menu's share sheet, the topic's own with this post shared in the topic's place */}
			{isShareOpen && <ShareTopicSheet {...toTopicPostShare(topicPost)} onClose={() => setIsShareOpen(false)} />}
			{/* the image sheet that a press on an editor's header image opens */}
			{isImageDialogOpen && (
				<EditImageDialog
					editableImage={toTopicPostEditableImage(topicPost)}
					onImageChanged={() => void refetch()}
					onClose={() => setIsImageDialogOpen(false)}
				/>
			)}
			{/* the author's own featured posts, with this post offered a place */}
			{isProfileRankDialogOpen && (
				<ProfileRankDialog
					rankedNoun="posts"
					pageItem={toTopicPostRankedItem(topicPost)}
					onClose={() => setIsProfileRankDialogOpen(false)}
				/>
			)}
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

// the published post, and the calls that open its share sheet, its editor, its author's rank sheet, and its delete
// confirmation
type ToTopicPostPageOptionsOptions = {
	topicPost: TopicPostResponse
	onShare: () => void
	onEdit: () => void
	onRankProfile: () => void
	onDelete: () => void
}

// the actions menu: Share, which opens the post's share sheet as the info popup's Share does, Edit post for its
// author, which says its limit past its edit time, Featured posts for the author of a published post of a public
// topic, as on the web, and Delete post for whoever may delete it. Report image follows them
function toTopicPostPageOptions({
	topicPost,
	onShare,
	onEdit,
	onRankProfile,
	onDelete,
}: ToTopicPostPageOptionsOptions): PageActionOption[] {
	return [
		{ label: TOPIC_POST_LABELS.share, icon: ShareIcon, onSelect: onShare },
		...(topicPost.isAuthor
			? [
					{
						label: TOPIC_POST_LABELS.edit,
						icon: Pencil,
						onSelect: onEdit,
						isDisabled: !topicPost.isEditable,
						disabledReason: TOPIC_POST_LABELS.lockedError,
					},
				]
			: []),
		...toProfileRankOptions(topicPost, onRankProfile),
		...(topicPost.canDelete ? [{ label: TOPIC_POST_LABELS.delete, icon: Trash2, onSelect: onDelete }] : []),
	]
}

// the author of a published post of a public topic arranges their own profile's featured posts from inside the post,
// as on the web
function toProfileRankOptions(topicPost: TopicPostResponse, onSelect: () => void): PageActionOption[] {
	return topicPost.isAuthor && isTopicPostPinnable(topicPost)
		? [{ label: PROFILE_RANK_OPTION_LABELS.posts, icon: NotebookPen, onSelect }]
		: []
}

// the editor's screen, as the note's: the header, the close control, and the editor in the keyboard-safe space
function TopicPostEditorScreen({ closePath, children }: { closePath: string; children: ReactNode }) {
	const [headerHeight, setHeaderHeight] = useState(0)
	const isKeyboardVisible = useIsKeyboardVisible()
	const isPodcastPlayerShown = useIsPodcastPlayerShown()
	const chatPillClearance = useFontScaledSize(44) + 24
	return (
		<View className="flex-1 bg-background">
			<View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
				{!isKeyboardVisible && <Header />}
			</View>
			<ClassNameSafeAreaView
				edges={isKeyboardVisible ? ["top", "left", "right", "bottom"] : ["left", "right", "bottom"]}
				className="w-full max-w-3xl flex-1 self-center"
			>
				<KeyboardAvoidingView
					className="flex-1"
					enabled={!isPodcastPlayerShown}
					keyboardVerticalOffset={headerHeight}
					behavior="padding"
				>
					{/* reserve launcher space inside the keyboard-adjusted viewport */}
					<View className="flex-1 px-4 pt-4" style={{ paddingBottom: isKeyboardVisible ? 0 : chatPillClearance }}>
						{/* return to the post's topic. the editor sends a waiting save as it closes */}
						<View className="mb-2 flex-row items-center justify-end">
							<AnchorLink href={closePath} shouldDismissTo accessibilityLabel="Close post" asChild>
								<Button accessibilityLabel="Close post" variant="ghost" size="icon">
									<Icon as={X} className="size-4 text-foreground" />
								</Button>
							</AnchorLink>
						</View>
						{children}
					</View>
				</KeyboardAvoidingView>
			</ClassNameSafeAreaView>
		</View>
	)
}

// the body on a card, with the note's typography and safe destination handling
function TopicPostBody({ html }: { html: string }) {
	// guard a stored destination even when the display library recognizes a link
	const handleOpenLink = (url: string): void => {
		const safeUrl = toNoteLinkUrl(url)
		if (safeUrl) {
			void openExternalLink(safeUrl)
		}
	}
	return (
		<View className="my-3 rounded-lg border border-border bg-card px-4 py-4 shadow-raised">
			<NoteReader html={html} onOpenLink={handleOpenLink} />
		</View>
	)
}

// a published post's Visitors line, read while the post's screen is the active route. a draft has none
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
