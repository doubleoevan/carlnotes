// a topic's tags in the header of its Topics row and its page. an untagged topic shows no row
import type { ComponentType, ReactNode } from "react"

// the platform's row, which lays the tags out under the image, and a tag
export type TopicTagsElements = {
	Row: ComponentType<{ children: ReactNode }>
	Tag: ComponentType<{ children: string }>
}

/**
 * Draws a topic's tags in the platform's row, or nothing for an untagged topic.
 */
export function TopicTags({ tags, elements: { Row, Tag } }: { tags: string[]; elements: TopicTagsElements }) {
	if (tags.length === 0) {
		return null
	}
	return (
		<Row>
			{tags.map((tag) => (
				<Tag key={tag}>{tag}</Tag>
			))}
		</Row>
	)
}
