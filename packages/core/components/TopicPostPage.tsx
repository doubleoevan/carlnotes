// a Topic Post's page: its image, its title with the info popup and the count of the reader's unseen Comment Mentions
// in its thread, its author's byline with the reactions right after it, its details line under them, its discussion,
// and its body, then what the page adds after it. a draft, and a published post its author is editing, show the
// editor instead
import type { UnseenCommentMention } from "@carlnotes/contracts/commentMentions"
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import { toTopicPath } from "@carlnotes/contracts/seo"
import type { ReactionSummary, SocialTarget } from "@carlnotes/contracts/social"
import type { TopicImageUrls } from "@carlnotes/contracts/topicImages"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import type { ComponentType, PropsWithChildren, ReactNode } from "react"
import { isTopicPostEditorShown, toTopicPostDetails, toTopicPostTitle } from "../lib/topicPosts"
import { usePageCommentMentions } from "../stores/commentMentionStore"
import type { DetailsLineProps } from "./DetailsLine"
import { TopicPostDiscussionCard, type TopicPostDiscussionCardElements } from "./TopicPostDiscussionCard"
import type { TopicPostEditorProps } from "./TopicPostEditor"
import type { TopicPostInfoProps } from "./TopicPostInfo"

// the post, whether its reader is signed in, whether its author asked to edit it, the count its comment thread
// reports as it stands, what a publish and the end of an edit do, the read of the post again that its discussion
// asks for, the press on an editor's image, and what follows the body
export type TopicPostPageProps = PropsWithChildren<{
	topicPost: TopicPostResponse
	isSignedIn: boolean
	isEditing: boolean
	// left out or null, the details line counts the comments the post's own read came with
	commentCount?: number | null
	onPublished: (topicPost: TopicPostResponse) => void
	onEditDone: () => void
	onChanged: () => void
	onEditImage?: () => void
}>

// each app's elements: the header's layout, the image, the title with its info popup and its mention badge, the badge
// that counts the mentions and opens their list, the row of the byline and the reactions, the details line under that
// row, the discussion card's elements, the body, and the app's editor
export type TopicPostPageElements = {
	Header: ComponentType<PropsWithChildren<{ image: ReactNode; title: ReactNode }>>
	Image: ComponentType<{ image: TopicImageUrls | null; name: string; onEdit?: () => void }>
	Title: ComponentType<{ info: ReactNode; mentionBadge: ReactNode; children: string }>
	Info: ComponentType<TopicPostInfoProps>
	MentionBadge: ComponentType<{ commentMentions: UnseenCommentMention[] }>
	BylineRow: ComponentType<PropsWithChildren>
	Byline: ComponentType<{ author: ProfileIdentity; topic: { name: string; path: string } }>
	Reactions: ComponentType<{ target: SocialTarget; summary: ReactionSummary; isSignedIn: boolean }>
	DetailsLine: ComponentType<DetailsLineProps>
	discussionElements: TopicPostDiscussionCardElements
	Body: ComponentType<{ html: string }>
	Editor: ComponentType<Omit<TopicPostEditorProps, "onError">>
}

/**
 * Shows a published Topic Post to its readers, and the editor to the author of a draft or of a published post inside
 * its edit time.
 */
export function TopicPostPage({
	topicPost,
	isSignedIn,
	isEditing,
	commentCount,
	onPublished,
	onEditDone,
	onChanged,
	onEditImage,
	children,
	elements,
}: TopicPostPageProps & { elements: TopicPostPageElements }) {
	const { Header, Image, Title, Info, MentionBadge, BylineRow, Byline, Reactions, DetailsLine, Body, Editor } = elements

	// the reader's unseen mentions in the post's own thread, which the title's badge counts
	const commentMentions = usePageCommentMentions({ kind: "post", id: topicPost.id })

	// a draft opens in its editor, and so does a published post its author edits inside its edit time
	if (isTopicPostEditorShown(topicPost, isEditing)) {
		return <Editor topicPost={topicPost} onPublished={onPublished} onDone={onEditDone} />
	}
	const title = toTopicPostTitle(topicPost)
	return (
		<>
			<Header
				image={<Image image={topicPost.image} name={title} onEdit={onEditImage} />}
				title={
					<Title
						info={<Info topicPostId={topicPost.id} title={title} topicPost={topicPost} />}
						mentionBadge={commentMentions.length > 0 && <MentionBadge commentMentions={commentMentions} />}
					>
						{title}
					</Title>
				}
			>
				{/* the byline leads, and the reactions come right after it in one wrapping row */}
				<BylineRow>
					<Byline
						author={topicPost.author}
						topic={{
							name: topicPost.topicName,
							path: toTopicPath({ id: topicPost.topicId, name: topicPost.topicName }),
						}}
					/>
					<Reactions
						target={{ kind: "post", id: topicPost.id }}
						summary={topicPost.reactions}
						isSignedIn={isSignedIn}
					/>
				</BylineRow>
				{/* when the post was published, its reading time, its thread's comment count, and whether it was edited, on
				    their own line */}
				<DetailsLine details={toTopicPostDetails(topicPost, commentCount ?? topicPost.commentThread?.commentCount)} />
			</Header>
			<TopicPostDiscussionCard topicPost={topicPost} onChanged={onChanged} elements={elements.discussionElements} />
			<Body html={topicPost.html} />
			{children}
		</>
	)
}
