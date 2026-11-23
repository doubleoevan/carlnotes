import { TopicTags as SharedTopicTags, type TopicTagsElements } from "@carlnotes/core/components/TopicTags"
import { Badge } from "@/components/primitives/badge"
import { TOPIC_HEADER_AREA_CLASSES } from "@/lib/pageHeaderClasses"

/**
 * Shows a topic's tags in its header's tags area, lined up with the title.
 */
export function TopicTags({ tags }: { tags: string[] }) {
	return <SharedTopicTags tags={tags} elements={TOPIC_TAGS_ELEMENTS} />
}

// on a phone each tag is inline, so the tags that no longer fit beside the floated image continue under it
const TOPIC_TAGS_ELEMENTS: TopicTagsElements = {
	Row: ({ children }) => <div className={TOPIC_HEADER_AREA_CLASSES.tags}>{children}</div>,
	Tag: ({ children }) => <Badge variant="secondary">{children}</Badge>,
}
