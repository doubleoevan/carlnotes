// the tag under a question asked from a Topic Post's page: the post's title, linked to its page while the post exists
import type { ChatTurnTopicPost } from "@carlnotes/contracts/chat"
import type { ComponentType, ReactNode } from "react"

// what the tag reads for a post that was deleted since the question
const DELETED_TOPIC_POST_LABEL = "A deleted post"

// the post a stored question was asked about
export type TopicPostTagProps = { topicPost: ChatTurnTopicPost }

// each app supplies its link, the same pill with no link, its icon, and its truncating text element
export type TopicPostTagElements = {
	Link: ComponentType<{ children: ReactNode; label: string; path: string; className: string }>
	Tag: ComponentType<{ children: ReactNode; className: string }>
	Icon: ComponentType
	Label: ComponentType<{ children: string }>
}

// the pill's classes, as the podcast episode chapter tag's
const TOPIC_POST_TAG_CLASS =
	"bg-muted text-muted-foreground hover:text-foreground mt-1 inline-flex min-h-11 max-w-[85%] items-center gap-1.5 rounded-full px-2.5 text-xs sm:min-h-7"

/**
 * Names the Topic Post a question was asked about, and opens the post's page when pressed. A post deleted since
 * shows as a tag with no link.
 */
export function TopicPostTag({
	topicPost,
	elements: { Link, Tag, Icon, Label },
}: TopicPostTagProps & { elements: TopicPostTagElements }) {
	// a deleted post keeps the tag and loses its link
	if (topicPost.title === null || topicPost.path === null) {
		return (
			<Tag className={TOPIC_POST_TAG_CLASS}>
				<Icon />
				<Label>{DELETED_TOPIC_POST_LABEL}</Label>
			</Tag>
		)
	}
	return (
		<Link label={`${topicPost.title}, open this post`} path={topicPost.path} className={TOPIC_POST_TAG_CLASS}>
			<Icon />
			<Label>{topicPost.title}</Label>
		</Link>
	)
}
