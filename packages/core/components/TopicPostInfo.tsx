// a Topic Post's info popup, which follows a Topic's: its title, its author with the reactions and Share, its Topic,
// its image, its discussion, and its summary in a box that scrolls. the post loads once the popup opens
import { fetchTopicPost } from "@carlnotes/client/topicPostClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import type { ReactionSummary, SocialTarget } from "@carlnotes/contracts/social"
import type { TopicImageUrls } from "@carlnotes/contracts/topicImages"
import {
	TOPIC_POST_DISCUSSION_TITLE,
	type TopicPostResponse,
	toTopicPostDiscussionPodcastEpisode,
} from "@carlnotes/contracts/topicPosts"
import { useQuery } from "@tanstack/react-query"
import { type ComponentType, type PropsWithChildren, type ReactNode, useState } from "react"
import { toTopicCountsDetails } from "../lib/detailsLine"
import { toTopicPostDiscussionInfoText } from "../lib/topicPostDiscussions"
import { TOPIC_POST_LABELS, toTopicPostNotesMarkdown } from "../lib/topicPosts"

// what the popup opens from: the post's id and its title. a row around the button opens the popup too, through isOpen
// and onOpenChange, and a page that already read the post passes it, so the popup reads nothing
export type TopicPostInfoProps = {
	topicPostId: string
	title: string
	isOpen?: boolean
	onOpenChange?: (isOpen: boolean) => void
	topicPost?: TopicPostResponse
}

// the platform's elements: the info button with what it opens, a popover on the web and a sheet in the app, the
// popup's title, a labeled section, the row of the author's byline, the reactions, and Share, which opens the
// platform's share options for the post, the post's image at full width, which opens the post's page and closes the
// popup, the discussion's play button before its day, length, and hosts, the Topic's image beside its linked name,
// whose press also closes the popup, with the details line of the Topic's viewers and followers under the name, the
// summary in a box that scrolls, whose copy button offers the Markdown the platform builds with its own site origin,
// and the lines an unavailable post and a loading one show
export type TopicPostInfoElements = {
	Frame: ComponentType<PropsWithChildren<{ label: string; isOpen: boolean; onOpenChange: (isOpen: boolean) => void }>>
	Title: ComponentType<{ children: string }>
	Section: ComponentType<{ label: string; children: ReactNode }>
	AuthorRow: ComponentType<PropsWithChildren<{ share: ReactNode }>>
	Byline: ComponentType<{ author: ProfileIdentity }>
	Reactions: ComponentType<{ target: SocialTarget; summary: ReactionSummary; isSignedIn: boolean }>
	ShareButton: ComponentType<{ topicPost: TopicPostResponse }>
	TopicRow: ComponentType<{
		topic: { id: string; name: string }
		image: TopicImageUrls | null
		details: string[]
		onOpen: () => void
	}>
	Image: ComponentType<{ image: TopicImageUrls; name: string; path: string; onOpen: () => void }>
	DiscussionRow: ComponentType<PropsWithChildren<{ detailsText: string }>>
	PlayButton: ComponentType<{ podcastEpisode: PodcastEpisode }>
	Notes: ComponentType<{ toCopyMarkdown: (origin: string) => string; children: string }>
	Unavailable: ComponentType<{ children: string }>
	Loading: ComponentType
}

/**
 * Shows a Topic Post's info popup under its button, for a card or a row that holds only the post's id. The post loads
 * once the popup opens, under the Topic Post screen's own cache key.
 */
export function TopicPostInfo({
	topicPostId,
	title,
	isOpen,
	onOpenChange,
	topicPost: knownTopicPost,
	userId,
	elements,
}: TopicPostInfoProps & {
	// who reads the post, or null for a visitor
	userId: string | null
	elements: TopicPostInfoElements
}) {
	// the popup's open state, which a row around the button holds if it opens the popup too
	const [isSelfOpen, setIsSelfOpen] = useState(false)
	const isPopupOpen = isOpen ?? isSelfOpen
	const handleOpenChange = onOpenChange ?? setIsSelfOpen

	// the post, read once the popup opens unless the page already read it
	const topicPostQuery = useQuery({
		queryKey: ["topic-post", userId, topicPostId],
		queryFn: () => fetchTopicPost(topicPostId),
		enabled: isPopupOpen && !knownTopicPost,
		retry: false,
	})
	const topicPost = knownTopicPost ?? topicPostQuery.data

	// a missing post, one the reader may not open, and a failed read all end as unavailable
	const isUnavailable = topicPostQuery.isError || topicPost === null
	const { Frame, Title, Unavailable, Loading } = elements
	return (
		<Frame label={TOPIC_POST_LABELS.info} isOpen={isPopupOpen} onOpenChange={handleOpenChange}>
			<Title>{title}</Title>
			{topicPost ? (
				<TopicPostInfoSections
					topicPost={topicPost}
					title={title}
					isSignedIn={userId !== null}
					onClose={() => handleOpenChange(false)}
					elements={elements}
				/>
			) : isUnavailable ? (
				<Unavailable>{TOPIC_POST_LABELS.infoUnavailable}</Unavailable>
			) : (
				<Loading />
			)}
		</Frame>
	)
}

// the popup's sections under its title
function TopicPostInfoSections({
	topicPost,
	title,
	isSignedIn,
	onClose,
	elements: { Section, AuthorRow, Byline, Reactions, ShareButton, TopicRow, Image, DiscussionRow, PlayButton, Notes },
}: {
	topicPost: TopicPostResponse
	// the post's title, or the line a draft with none shows
	title: string
	isSignedIn: boolean
	onClose: () => void
	elements: TopicPostInfoElements
}) {
	// a published post offers its share options, as its page's actions menu does, and a finished recording plays
	const { path, summary } = topicPost
	const isPublished = topicPost.publishedAt !== null
	const discussionPodcastEpisode = toTopicPostDiscussionPodcastEpisode(topicPost)
	return (
		<>
			{/* the author, the reactions right after the byline, and Share at the right */}
			<Section label={TOPIC_POST_LABELS.writtenBy}>
				<AuthorRow share={isPublished && <ShareButton topicPost={topicPost} />}>
					<Byline author={topicPost.author} />
					{isPublished && (
						<Reactions
							target={{ kind: "post", id: topicPost.id }}
							summary={topicPost.reactions}
							isSignedIn={isSignedIn}
						/>
					)}
				</AuthorRow>
			</Section>
			{/* the post's Topic with its viewers and followers under its name, in the row right after the author's */}
			<Section label={TOPIC_POST_LABELS.topic}>
				<TopicRow
					topic={{ id: topicPost.topicId, name: topicPost.topicName }}
					image={topicPost.topicImage}
					details={toTopicCountsDetails(topicPost.topicCounts)}
					onOpen={onClose}
				/>
			</Section>
			{/* the post's own image, then the discussion's play button before its day, length, and hosts */}
			{topicPost.image && <Image image={topicPost.image} name={title} path={path} onOpen={onClose} />}
			{discussionPodcastEpisode && topicPost.discussion && (
				<Section label={TOPIC_POST_DISCUSSION_TITLE}>
					<DiscussionRow detailsText={toTopicPostDiscussionInfoText(topicPost.discussion)}>
						<PlayButton podcastEpisode={discussionPodcastEpisode} />
					</DiscussionRow>
				</Section>
			)}
			{/* the summary, which the copy button offers as Markdown */}
			<Section label={TOPIC_POST_LABELS.notes}>
				<Notes toCopyMarkdown={(origin) => toTopicPostNotesMarkdown({ title, path, summary, origin })}>
					{summary ?? TOPIC_POST_LABELS.noNotes}
				</Notes>
			</Section>
		</>
	)
}
