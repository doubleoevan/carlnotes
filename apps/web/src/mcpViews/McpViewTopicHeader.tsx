import type { McpViewTopic } from "@carlnotes/contracts/mcpViews"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { TopicNameLink } from "@/components/table/TopicNameLink"
import { TopicImageLink } from "@/components/topic/TopicImageLink"
import { McpViewSubscribeButton } from "./McpViewSubscribeButton"

/**
 * The header an MCP view heads a Topic's rows or cards with: the Topic's image and name, each linked to the Topic's
 * page, and Follow.
 */
export function McpViewTopicHeader({ topic }: { topic: McpViewTopic }) {
	return (
		<div className="mb-2 flex items-center justify-between gap-3">
			<span className="flex min-w-0 items-center gap-3">
				<TopicImageLink image={topic.image} size="list" name={topic.name} path={toTopicPath(topic)} />
				<span className="font-display min-w-0 text-lg">
					<TopicNameLink topic={topic} />
				</span>
			</span>
			<McpViewSubscribeButton topicId={topic.id} isSubscribed={topic.isSubscribed} />
		</div>
	)
}
