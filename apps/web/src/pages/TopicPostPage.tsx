import { authClient } from "@carlnotes/client/authClient"
import { deleteTopicPost, fetchTopicPost } from "@carlnotes/client/topicPostClient"
import { isAdminRole } from "@carlnotes/contracts/enums"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { type TopicPostResponse, toBodyParagraphs } from "@carlnotes/contracts/topicPosts"
import {
	TopicPostPage as SharedTopicPostPage,
	type TopicPostPageElements,
} from "@carlnotes/core/components/TopicPostPage"
import { useTopicPostView } from "@carlnotes/core/hooks/useTopicPostView"
import {
	HOME_RANK_OPTION_LABELS,
	PROFILE_RANK_OPTION_LABELS,
	toTopicPostRankedItem,
} from "@carlnotes/core/lib/rankDialog"
import { EDIT_IMAGE_DIALOG_TITLES } from "@carlnotes/core/lib/topicImageEditor"
import {
	isTopicPostPinnable,
	isTopicPostUrlStale,
	TOPIC_POST_DELETE,
	TOPIC_POST_LABELS,
	toTopicPostDeleteDescription,
	toTopicPostEditableImage,
	toTopicPostImageReport,
	toTopicPostShare,
	toTopicPostTitle,
} from "@carlnotes/core/lib/topicPosts"
import { useRegisterChatTopicPost } from "@carlnotes/core/stores/topicPostChatStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { useLocation, useMatch, useNavigate, useParams } from "@tanstack/react-router"
import { NotebookPen, Pencil, Share, Trash2 } from "lucide-react"
import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { DetailsLine } from "@/components/common/DetailsLine"
import { ProfileRankDialog } from "@/components/common/RankDialog"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { ViewerCountLine } from "@/components/common/ViewerCountLine"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { NOTE_BODY_CLASS, NOTE_BODY_STYLE } from "@/components/note/noteStyle"
import { ShareTopic } from "@/components/share/ShareTopic"
import { CommentMentionBadge } from "@/components/social/CommentMentionBadge"
import { ReactionRow } from "@/components/social/ReactionRow"
import { SocialSection } from "@/components/social/SocialSection"
import { EditImageDialog } from "@/components/topic/EditImageDialog"
import { TopicHeaderImage } from "@/components/topic/TopicImageButton"
import { HomeTopicPostRankDialog } from "@/components/topicPost/HomeTopicPostRankDialog"
import { TOPIC_POST_DISCUSSION_CARD_ELEMENTS } from "@/components/topicPost/TopicPostDiscussionCard"
import { TopicPostInfo } from "@/components/topicPost/TopicPostInfo"
import { useIsMounted, useLoadInBrowser } from "@/hooks/useBrowserValue"
import { usePageTitle } from "@/hooks/usePageTitle"
import { PLAIN_TOPIC_HEADER_GRID_CLASS, TOPIC_HEADER_AREA_CLASSES } from "@/lib/pageHeaderClasses"
import { PAGE_CLASS } from "@/lib/styleClasses"
import { type PageActionOption, useRegisterPageActions } from "@/stores/pageActionsStore"

// the editor and the reader load with the editor package, in the browser alone
const TopicPostEditor = lazy(() =>
	import("@/components/topicPost/TopicPostEditor").then((editorModule) => ({ default: editorModule.TopicPostEditor })),
)
const TopicPostReader = lazy(() =>
	import("@/components/topicPost/TopicPostReader").then((readerModule) => ({ default: readerModule.TopicPostReader })),
)

// the line shown while the Topic Post's editor is on its way
const LOADING_LINE = <p className="text-muted-foreground mt-6 text-sm">{TOPIC_POST_LABELS.loading}</p>

// the web's elements: the topic header's layout, the note's typography on a page card, and the lazy editor
export const TOPIC_POST_PAGE_ELEMENTS: TopicPostPageElements = {
	Header: ({ image, title, children }) => (
		<header className={PLAIN_TOPIC_HEADER_GRID_CLASS}>
			{image}
			{title}
			<div className={TOPIC_HEADER_AREA_CLASSES.byline}>{children}</div>
		</header>
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
		<h1 className={cn(TOPIC_HEADER_AREA_CLASSES.title, "font-display text-2xl leading-tight text-balance sm:text-3xl")}>
			{children}
			<span className="ml-2 inline-flex align-middle">{info}</span>
			{mentionBadge && <span className="ml-2 inline-flex align-middle">{mentionBadge}</span>}
		</h1>
	),
	Info: TopicPostInfo,
	MentionBadge: ({ commentMentions }) => <CommentMentionBadge commentMentions={commentMentions} place="title" />,
	BylineRow: ({ children }) => (
		<div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 max-sm:clear-left">{children}</div>
	),
	Byline: ({ author, topic }) => (
		<span className="text-muted-foreground inline-flex flex-wrap items-center gap-x-1 text-sm">
			<UserProfileLink user={author} label={TOPIC_POST_LABELS.writtenBy} className="text-sm" />
			<span>
				{"for "}
				<AnchorLink href={topic.path} className="sentence-link">
					{topic.name}
				</AnchorLink>
			</span>
		</span>
	),
	Reactions: ReactionRow,
	DetailsLine: (props) => <DetailsLine className="mt-1" {...props} />,
	discussionElements: TOPIC_POST_DISCUSSION_CARD_ELEMENTS,
	Body: TopicPostBody,
	Editor: (props) => (
		<Suspense fallback={LOADING_LINE}>
			<TopicPostEditor {...props} />
		</Suspense>
	),
}

/**
 * A Topic Post's own page at /topics/$topicId/$topicSlug/posts/$topicPostId/$postSlug. Its author's draft opens in
 * the editor.
 */
export function TopicPostPage() {
	const { topicPostId = "" } = useParams({ strict: false })

	// the Topic Post that the route loads on the server, or undefined after a browser navigation
	const loadedTopicPost =
		useMatch({
			from: "/_layout/topics/$topicId_/$topicSlug_/posts/$topicPostId_/$postSlug",
			shouldThrow: false,
			select: (topicPostMatch) => topicPostMatch.loaderData?.topicPost,
		}) ?? undefined

	// the Topic Post. undefined while loading, and null if it is missing or the user may not read it
	const [topicPost, setTopicPost] = useState<TopicPostResponse | null | undefined>(loadedTopicPost)
	const [isEditing, setIsEditing] = useState(false)
	const [isDeleteOpen, setIsDeleteOpen] = useState(false)
	const [isImageDialogOpen, setIsImageDialogOpen] = useState(false)
	const [isShareOpen, setIsShareOpen] = useState(false)

	// the count that the comment thread reports as it stands, for the details line
	const [commentCount, setCommentCount] = useState<number | null>(null)

	// the rank dialog that the actions menu opened: the home's, or the author's own profile's
	const [openRankDialog, setOpenRankDialog] = useState<TopicPostRankDialog | null>(null)

	// load in the browser unless the server already loaded this Topic Post
	const loadTopicPost = useCallback((): void => {
		fetchTopicPost(topicPostId)
			.then(setTopicPost)
			.catch(() => setTopicPost(null))
	}, [topicPostId])
	useLoadInBrowser({ pageId: topicPostId, isLoadedOnServer: Boolean(loadedTopicPost), loadPage: loadTopicPost })
	usePageTitle(topicPost ? toTopicPostTitle(topicPost) : null)

	// the chat launcher opens the private chat of the Topic Post's topic, which asks about this Topic Post, while its
	// page shows
	useRegisterChatTopicPost(topicPost?.publishedAt ? topicPost : null)

	// keep the url on the Topic Post's current path, whose slug follows its title, once the url's Topic Post loads. a
	// url that already left for another page, while that page loads, is left alone
	const navigate = useNavigate()
	const pathname = useLocation({ select: (location) => location.pathname })
	useEffect(() => {
		if (topicPost && isTopicPostUrlStale({ pathname, topicPostId, topicPost })) {
			void navigate({ to: topicPost.path, replace: true })
		}
	}, [topicPost, topicPostId, pathname, navigate])

	// send the Topic Post page's view once per tab, once a published Topic Post has loaded
	useTopicPostView(topicPost?.publishedAt ? topicPost.id : null)

	// read the session, and register the actions menu
	const { data: session } = authClient().useSession()
	useRegisterTopicPostPageActions({
		topicPost,
		isAdminUser: isAdminRole(session?.user.role),
		onShare: () => setIsShareOpen(true),
		onEdit: () => setIsEditing(true),
		onOpenRankDialog: setOpenRankDialog,
		onDelete: () => setIsDeleteOpen(true),
	})

	// the Topic Post's skeleton while it loads, or the line for a Topic Post that did not load
	if (topicPost === undefined) {
		return (
			<main className={PAGE_CLASS}>
				<PageSkeleton kind="topicPost" pageElements={TOPIC_POST_PAGE_ELEMENTS} />
			</main>
		)
	}
	if (topicPost === null) {
		return (
			<main className={PAGE_CLASS}>
				<p className="text-muted-foreground mt-6 text-sm">{TOPIC_POST_LABELS.missing}</p>
			</main>
		)
	}

	// delete the Topic Post and its thread, then open its topic's page. a failed delete keeps the page
	const handleDelete = async (): Promise<void> => {
		if (await deleteTopicPost(topicPost.id)) {
			void navigate({ to: toTopicPath({ id: topicPost.topicId, name: topicPost.topicName }) })
		} else {
			toast.error(TOPIC_POST_LABELS.deleteError)
		}
	}
	return (
		<main className={PAGE_CLASS}>
			<SharedTopicPostPage
				topicPost={topicPost}
				isSignedIn={Boolean(session)}
				isEditing={isEditing}
				commentCount={commentCount}
				onPublished={setTopicPost}
				onEditDone={() => {
					setIsEditing(false)
					loadTopicPost()
				}}
				onChanged={loadTopicPost}
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
				{/* a published Topic Post's viewer count line, the page's last line */}
				{topicPost.publishedAt && (
					<ViewerCountLine
						viewerCountPage={{ kind: "topicPost", id: topicPost.id, isPublic: topicPost.isTopicPublic }}
					/>
				)}
			</SharedTopicPostPage>

			{/* the actions menu's share dialog, the topic's own with this Topic Post shared in the topic's place */}
			{isShareOpen && <ShareTopic {...toTopicPostShare(topicPost)} isDialog onClose={() => setIsShareOpen(false)} />}

			{/* the image dialog that a press on an editor's header image opens */}
			{isImageDialogOpen && (
				<EditImageDialog
					editableImage={toTopicPostEditableImage(topicPost)}
					onImageChanged={loadTopicPost}
					onClose={() => setIsImageDialogOpen(false)}
				/>
			)}

			{/* the actions menu's rank dialogs, each with this Topic Post offered a place: the admin's home
			    Topic Posts, and the author's own featured Topic Posts */}
			{openRankDialog === "rank" && (
				<HomeTopicPostRankDialog pageTopicPost={topicPost} onClose={() => setOpenRankDialog(null)} />
			)}
			{openRankDialog === "rank-profile" && (
				<ProfileRankDialog
					rankedNoun="posts"
					pageItem={toTopicPostRankedItem(topicPost)}
					onClose={() => setOpenRankDialog(null)}
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
		</main>
	)
}

// the rank dialogs that the actions menu opens: the home's pinned Topic Posts, and the author's own profile's
type TopicPostRankDialog = "rank" | "rank-profile"

// a published Topic Post's rank options on a public topic: the home's for an admin and the profile's for the
// Topic Post's author, both under the notebook-pen icon
function toTopicPostRankOptions(
	topicPost: TopicPostResponse,
	isAdminUser: boolean,
	onOpenRankDialog: (topicPostRankDialog: TopicPostRankDialog) => void,
): PageActionOption[] {
	if (!isTopicPostPinnable(topicPost)) {
		return []
	}
	return [
		...(isAdminUser
			? [{ label: HOME_RANK_OPTION_LABELS.posts, Icon: NotebookPen, onSelect: () => onOpenRankDialog("rank") }]
			: []),
		...(topicPost.isAuthor
			? [
					{
						label: PROFILE_RANK_OPTION_LABELS.posts,
						Icon: NotebookPen,
						onSelect: () => onOpenRankDialog("rank-profile"),
					},
				]
			: []),
	]
}

// the loaded Topic Post, whether the user is an admin, and the calls that open its share dialog, its editor, one of
// its rank dialogs, and its delete confirmation
type UseRegisterTopicPostPageActionsOptions = {
	topicPost: TopicPostResponse | null | undefined
	isAdminUser: boolean
	onShare: () => void
	onEdit: () => void
	onOpenRankDialog: (topicPostRankDialog: TopicPostRankDialog) => void
	onDelete: () => void
}

// register the actions menu: Share on a published Topic Post, which opens its share dialog as the info popup's Share
// opens its share options, Edit post for its author, disabled past its edit time, Home posts for an admin and
// Featured posts for its author on a published Topic Post of a public topic, Delete post for whoever may delete it,
// and Report image on a published Topic Post
function useRegisterTopicPostPageActions({
	topicPost,
	isAdminUser,
	onShare,
	onEdit,
	onOpenRankDialog,
	onDelete,
}: UseRegisterTopicPostPageActionsOptions): void {
	const isPublished = Boolean(topicPost?.publishedAt)
	const options: PageActionOption[] = topicPost
		? [
				...(isPublished ? [{ label: TOPIC_POST_LABELS.share, Icon: Share, onSelect: onShare }] : []),
				...(isPublished && topicPost.isAuthor
					? [
							{
								label: TOPIC_POST_LABELS.edit,
								Icon: Pencil,
								onSelect: onEdit,
								isDisabled: !topicPost.isEditable,
								disabledReason: TOPIC_POST_LABELS.lockedError,
							},
						]
					: []),
				...toTopicPostRankOptions(topicPost, isAdminUser, onOpenRankDialog),
				...(topicPost.canDelete ? [{ label: TOPIC_POST_LABELS.delete, Icon: Trash2, onSelect: onDelete }] : []),
			]
		: []
	useRegisterPageActions(
		topicPost ? { page: "Post", options, report: isPublished ? toTopicPostImageReport(topicPost) : undefined } : null,
	)
}

// the body on a page card. the server and the first browser render show its text as plain paragraphs at the rich
// text's line spacing, and the rich text display replaces them once it loads in the browser
function TopicPostBody({ html }: { html: string }) {
	const isMounted = useIsMounted()
	const plainBody = (
		<div className={cn(NOTE_BODY_CLASS, "space-y-3")} style={NOTE_BODY_STYLE}>
			{toBodyParagraphs(html).map((paragraph, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: the paragraphs of one body never reorder
				<p key={i}>{paragraph}</p>
			))}
		</div>
	)
	return (
		<article className="bg-card my-4 rounded-lg border py-4 shadow-raised sm:py-6">
			{isMounted ? (
				<Suspense fallback={plainBody}>
					<TopicPostReader html={html} />
				</Suspense>
			) : (
				plainBody
			)}
		</article>
	)
}
