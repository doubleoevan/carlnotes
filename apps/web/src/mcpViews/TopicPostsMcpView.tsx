import type { McpViewTopic } from "@carlnotes/contracts/mcpViews"
import { toTopicPath } from "@carlnotes/contracts/seo"
import type { TopicPostCard as TopicPostCardFields } from "@carlnotes/contracts/topicPosts"
import { TopicPostCard, type TopicPostCardElements } from "@carlnotes/core/components/TopicPostCard"
import { TopicPostsSection, type TopicPostsSectionElements } from "@carlnotes/core/components/TopicPostsSection"
import { cn } from "@carlnotes/nightshift/classNames"
import { AnchorLink } from "@/components/common/AnchorLink"
import { CARD_TITLE_LINE_CLASS, TOPIC_POST_CARD_ELEMENTS } from "@/components/topicPost/TopicPostCard"
import { TopicPostInfo } from "@/components/topicPost/TopicPostInfo"
import { TOPIC_POSTS_SECTION_ELEMENTS } from "@/components/topicPost/TopicPostsSection"
import { STANDALONE_LINE_LINK_CLASS, STRETCHED_CARD_LINK_CLASS } from "@/lib/styleClasses"
import { McpViewTopicHeader } from "./McpViewTopicHeader"
import { TOPIC_POST_ROUTE_PREFIX } from "./mcpViewHistory"
import { moveMcpViewOneHop } from "./mcpViewHop"
import { toMcpViewSiteUrl } from "./mcpViewHost"
import { MCP_VIEW_TOPIC_POST_INFO_ELEMENTS } from "./mcpViewTopicPostInfoElements"

// the tool that reads one Topic Post, which a card's press calls
const TOPIC_POST_TOOL = "read_topic_post"

/**
 * The topic posts MCP view: a Topic's published Topic Posts as the site's own cards, newest first, under the Topic's
 * header. A card's press reads its post through the host and moves to it, and a Topic with no post shows the
 * section's empty line. The view offers no publish button.
 */
export function TopicPostsMcpView({
	topic,
	topicPosts,
	hasMoreTopicPosts,
}: {
	topic: McpViewTopic
	topicPosts: TopicPostCardFields[]
	// whether the tool result has a page of posts after this one
	hasMoreTopicPosts: boolean
}) {
	return (
		<div>
			<McpViewTopicHeader topic={topic} />
			{/* the shared section shows its empty line only to a user who may publish, and the view's button draws nothing */}
			<TopicPostsSection
				topicPosts={topicPosts}
				canPublish
				isCreating={false}
				onNewPost={ignoreNewPost}
				elements={MCP_VIEW_TOPIC_POSTS_SECTION_ELEMENTS}
			/>
			{/* ponytail: the view shows the tool's first page of posts, and the rest on the Topic's page. page through the
			    tool's cursor if Topics grow past a page of posts */}
			{hasMoreTopicPosts && (
				<AnchorLink href={toTopicPath(topic)} className={cn(STANDALONE_LINE_LINK_CLASS, "mt-4")}>
					See all on CarlNotes
				</AnchorLink>
			)}
		</div>
	)
}

// one Topic Post's card, whose press takes the one hop to the post
function McpViewTopicPostCard({ topicPost }: { topicPost: TopicPostCardFields }) {
	const openTopicPost = (): void =>
		void moveMcpViewOneHop({
			toolName: TOPIC_POST_TOOL,
			toolArguments: { topic_post_id: topicPost.id },
			path: `${TOPIC_POST_ROUTE_PREFIX}${topicPost.id}`,
			href: topicPost.path,
		})
	return <TopicPostCard topicPost={topicPost} onOpen={openTopicPost} elements={MCP_VIEW_TOPIC_POST_CARD_ELEMENTS} />
}

// the web's elements of the card, with a title whose link opens the post in the MCP view, which a frame cannot
// navigate away from, and the MCP view's info popup, which reads the post through its tool
const MCP_VIEW_TOPIC_POST_CARD_ELEMENTS: TopicPostCardElements = {
	...TOPIC_POST_CARD_ELEMENTS,
	Info: (props) => <TopicPostInfo {...props} isInline elements={MCP_VIEW_TOPIC_POST_INFO_ELEMENTS} />,
	Title: ({ path, label, onOpen, aside, children }) => (
		<div className={CARD_TITLE_LINE_CLASS}>
			<a
				href={toMcpViewSiteUrl(path)}
				aria-label={label}
				className={STRETCHED_CARD_LINK_CLASS}
				onClick={(event) => {
					event.preventDefault()
					onOpen?.()
				}}
			>
				{children}
			</a>
			{aside}
		</div>
	),
}

// the web's elements of the section, with the MCP view's card and no button that starts a draft
const MCP_VIEW_TOPIC_POSTS_SECTION_ELEMENTS: TopicPostsSectionElements = {
	...TOPIC_POSTS_SECTION_ELEMENTS,
	Card: McpViewTopicPostCard,
	NewPostButton: () => null,
}

// an MCP view starts no draft
function ignoreNewPost(): void {}
