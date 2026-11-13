import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { SocialSection, type SocialSectionElements } from "@carlnotes/core/components/SocialSection"
import { TopicPostPage, type TopicPostPageElements } from "@carlnotes/core/components/TopicPostPage"
import { useState } from "react"
import { SOCIAL_SECTION_ELEMENTS } from "@/components/social/SocialSection"
import { TopicPostInfo } from "@/components/topicPost/TopicPostInfo"
import { TOPIC_POST_PAGE_ELEMENTS } from "@/pages/TopicPostPage"
import { McpViewCommentThread } from "./McpViewCommentThread"
import { McpViewReactionRow } from "./McpViewReactionRow"
import { MCP_VIEW_TOPIC_POST_INFO_ELEMENTS, McpViewDiscussionPlayButton } from "./mcpViewElements"
import { useMcpViewData } from "./mcpViewHost"

/**
 * The topic post MCP view: one published Topic Post as the site's own page shows it, with its image, its title with
 * the info popup, its byline and reactions, its discussion's player, its body, and its comment thread. The view has
 * no editor, no Regenerate, and no image editing, and it makes no tool call on load.
 */
export function TopicPostMcpView({ topicPost }: { topicPost: TopicPostResponse }) {
	const isSignedIn = useMcpViewData().session !== null
	// the count that the comment thread reports as it stands, for the details line
	const [commentCount, setCommentCount] = useState<number | null>(null)
	return (
		<TopicPostPage
			topicPost={topicPost}
			isSignedIn={isSignedIn}
			isEditing={false}
			commentCount={commentCount}
			onPublished={ignoreChange}
			onEditDone={ignoreChange}
			onChanged={ignoreChange}
			elements={MCP_VIEW_TOPIC_POST_PAGE_ELEMENTS}
		>
			{/* the post's comment thread, whose first page came with the tool result */}
			<SocialSection
				target={{ kind: "post", id: topicPost.id }}
				firstPage={topicPost.commentThread}
				isSignedIn={isSignedIn}
				topicId={topicPost.topicId}
				isTopicOwner={topicPost.isTopicOwner}
				onCommentCountChange={setCommentCount}
				elements={MCP_VIEW_SOCIAL_SECTION_ELEMENTS}
			/>
		</TopicPostPage>
	)
}

// the web's elements of the page, with the MCP view's info popup, reactions that save through their tool, and the
// discussion's play button that plays the tool result's recording
const MCP_VIEW_TOPIC_POST_PAGE_ELEMENTS: TopicPostPageElements = {
	...TOPIC_POST_PAGE_ELEMENTS,
	Info: (props) => <TopicPostInfo {...props} elements={MCP_VIEW_TOPIC_POST_INFO_ELEMENTS} />,
	Reactions: (props) => <McpViewReactionRow {...props} className="flex flex-col gap-1" />,
	discussionElements: { ...TOPIC_POST_PAGE_ELEMENTS.discussionElements, PlayButton: McpViewDiscussionPlayButton },
}

// the web's elements of the thread's section, with the MCP view's thread
const MCP_VIEW_SOCIAL_SECTION_ELEMENTS: SocialSectionElements = {
	...SOCIAL_SECTION_ELEMENTS,
	CommentThread: McpViewCommentThread,
}

// an MCP view publishes nothing, edits nothing, and starts no recording
function ignoreChange(): void {}
