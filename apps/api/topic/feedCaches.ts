// the Redis keys that the topic feeds and topic pages are cached under, and the deletes that clear them
import type { Visibility } from "@carlnotes/contracts/enums"
import { deleteRedisKeys } from "@carlnotes/db/redis"

// the Redis key every replica reads the featured and popular topic id lists through
export const TOPIC_SECTION_IDS_KEY = "topic-section-ids"

// the Redis key prefix the visitors' feed is served through, one key per view
const VISITOR_TOPIC_FEED_KEY_PREFIX = "topic-feed:visitor"

// the Redis key prefix that a topic page is served through, to visitors and to a poll reload
export const TOPIC_PAGE_KEY_PREFIX = "topic-page"

// the topic whose cached visitor copies to drop, its visibility after the change, its visibility before the change if
// the change may have set a new one, and whether the change released its feature order
type ClearVisitorTopicCachesOptions = {
	topicId: string
	visibility: Visibility
	previousVisibility?: Visibility
	isFeatureOrderReleased?: boolean
}

/**
 * Deletes the shared topic section id lists and the visitors' feeds, so the next feed build on any replica reads them fresh.
 */
export async function clearSharedTopicFeedCaches(): Promise<void> {
	await deleteRedisKeys(...toSharedTopicFeedKeys())
}

/**
 * Deletes a topic's cached visitor page, and the visitors' feeds if the topic was or is public or featured.
 */
export async function clearVisitorTopicCaches({
	topicId,
	visibility,
	previousVisibility = visibility,
	isFeatureOrderReleased = false,
}: ClearVisitorTopicCachesOptions): Promise<void> {
	// the visitors' feeds list public topics with their sources, so a change to a topic that was or is public drops them
	const isListingChanged = isFeatureOrderReleased || visibility === "public" || previousVisibility === "public"
	await deleteRedisKeys(toVisitorTopicPageKey(topicId), ...(isListingChanged ? toSharedTopicFeedKeys() : []))
}

/**
 * Deletes the topics' cached visitor pages alone, in one delete.
 */
export async function clearVisitorTopicPages(...topicIds: string[]): Promise<void> {
	await deleteRedisKeys(...topicIds.map(toVisitorTopicPageKey))
}

// the shared topic section id lists and both views of the visitors' feed
function toSharedTopicFeedKeys(): string[] {
	return [TOPIC_SECTION_IDS_KEY, toVisitorTopicFeedKey(true), toVisitorTopicFeedKey(false)]
}

/**
 * Returns the Redis key a topic's page is served to visitors through.
 */
export function toVisitorTopicPageKey(topicId: string): string {
	return `${TOPIC_PAGE_KEY_PREFIX}:visitor-page:${topicId}`
}

/**
 * Returns the Redis key the visitors' feed is served through, one key per view.
 */
export function toVisitorTopicFeedKey(includeConsumedResources: boolean): string {
	return `${VISITOR_TOPIC_FEED_KEY_PREFIX}:${includeConsumedResources ? "all" : "unread"}`
}
