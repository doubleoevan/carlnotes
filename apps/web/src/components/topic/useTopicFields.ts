import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	type TopicFields as SharedTopicFields,
	useTopicFields as useSharedTopicFields,
} from "@carlnotes/core/hooks/useTopicFields"

export type { Visibility } from "@carlnotes/core/hooks/useTopicFields"
export { toUpdateTopicPayload } from "@carlnotes/core/hooks/useTopicFields"
export type TopicFields = SharedTopicFields<File>

/**
 * Seeds the shared Topic editor with browser attachment files.
 */
export function useTopicFields(topic: TopicResponse | undefined, isMakingTopicPublic?: boolean): TopicFields {
	return useSharedTopicFields<File>(topic, isMakingTopicPublic)
}
