// the Redis keys that the topic feeds are cached under, and the deletes that clear them with the topic's page copies
import type { Visibility } from "@carlnotes/contracts/enums"
import { deleteRedisKeys } from "@carlnotes/db/redis"
import {
	clearVisitorProfilePages,
	loadVisitorPagesOfTopic,
	toVisitorHomePageKey,
	type VisitorPagesOfTopic,
} from "@carlnotes/db/visitorPageCaches"
import {
	HOME_PAGE_CACHE_TAG,
	purgeEdgeCacheTagAfterDeletion,
	toProfilePageCacheTag,
	toTeamPageCacheTag,
	toTopicImageCacheTag,
	toTopicPageCacheTag,
} from "@carlnotes/server/edgePurge"

// the Redis key every replica reads the home and popular topic id lists through
export const TOPIC_SECTION_IDS_KEY = "home-and-popular-topic-ids"

// the Redis key every replica reads the ids of the home page's cards through
export const HOME_CARD_IDS_KEY = "home-card-ids"

// the Redis key prefix the visitors' feed is served through, one key per view
const VISITOR_TOPIC_FEED_KEY_PREFIX = "visitor-topic-feed"

// the Redis key prefix that a topic page's poll reload is served through
export const TOPIC_PAGE_KEY_PREFIX = "topic-response"

// the Redis key that a public topic's RSS feed is cached under
export function toTopicFeedXmlKey(topicId: string): string {
	return `topic-feed-xml:${topicId}`
}

// the topic whose cached visitor copies to drop, its owner, its visibility after the change, its visibility before the
// change if the change may have set a new one, whether the change deleted it, whether the change released its home
// order, and the users whose featured profile items the change released
type ClearVisitorTopicCachesOptions = {
	topicId: string
	ownerId?: string
	visibility: Visibility
	previousVisibility?: Visibility
	// what else the change did
	isDeleted?: boolean
	isHomeOrderReleased?: boolean
	releasedProfileUserIds?: string[]
	// the topic's pages that a delete read before its rows went
	visitorPagesOfTopic?: VisitorPagesOfTopic
}

/**
 * Deletes the shared topic section id lists, the visitors' feeds, and the visitors' home, so the next build on any
 * replica reads them fresh.
 */
export async function clearSharedTopicFeedCaches(): Promise<void> {
	await deleteRedisKeys(...toSharedTopicFeedKeys(), toVisitorHomePageKey())
}

/**
 * Deletes the visitor copies of every page that shows a topic and the topic's RSS feed, the visitors' feeds and the
 * home if the topic was or is public or featured, and purges at the edge in one request what a visibility change, a
 * delete, or a release changed.
 */
export async function clearVisitorTopicCaches({
	topicId,
	ownerId,
	visibility,
	previousVisibility = visibility,
	isDeleted = false,
	isHomeOrderReleased = false,
	releasedProfileUserIds = [],
	visitorPagesOfTopic,
}: ClearVisitorTopicCachesOptions): Promise<void> {
	// the copies of every page that shows the topic, and the people and teams whose pages show it
	const { pageKeys, profileUserIds, teamIds } = visitorPagesOfTopic ?? (await loadVisitorPagesOfTopic(topicId))

	// the visitors' feeds list public topics with their sources, so a change to a topic that was or is public drops them
	// with the copies of the topic's own pages and of the released profiles. the home's copy goes only if the topic joined
	// or left the public set or the home, and a plain edit waits out the home copy's minute as the edge's copy does
	const isListingChanged = isHomeOrderReleased || visibility === "public" || previousVisibility === "public"
	const isTopicGone = isDeleted || visibility !== previousVisibility
	const isHomeChanged =
		isHomeOrderReleased || (isTopicGone && (visibility === "public" || previousVisibility === "public"))
	await Promise.all([
		deleteRedisKeys(...pageKeys),
		clearVisitorProfilePages(...releasedProfileUserIds),
		deleteRedisKeys(
			toTopicFeedXmlKey(topicId),
			...(isListingChanged ? toSharedTopicFeedKeys() : []),
			...(isHomeChanged ? [toVisitorHomePageKey()] : []),
		),
	])

	// the edge tags of what the change left stale
	const cacheTags = toChangedTopicCacheTags({
		topicId,
		ownerId,
		visibility,
		previousVisibility,
		isDeleted,
		isHomeOrderReleased,
		releasedProfileUserIds,
		profileUserIds,
		teamIds,
	})
	if (cacheTags.size > 0) {
		await purgeEdgeCacheTagAfterDeletion(...cacheTags)
	}
}

// the options of the edge tags a topic change left stale: the change, and the people and teams whose pages show the
// topic
type ChangedTopicCacheTagsOptions = Required<
	Pick<
		ClearVisitorTopicCachesOptions,
		"topicId" | "visibility" | "previousVisibility" | "isDeleted" | "isHomeOrderReleased" | "releasedProfileUserIds"
	>
> & { ownerId: string | null | undefined; profileUserIds: string[]; teamIds: string[] }

// a topic that changed visibility or was deleted leaves its pages, its owner's and its posts' authors' profiles, and
// its teams' pages at the edge. a public one leaves its image files and the home too, and a released featured item
// leaves the home or the profile that showed it
function toChangedTopicCacheTags({
	topicId,
	ownerId,
	visibility,
	previousVisibility,
	isDeleted,
	isHomeOrderReleased,
	releasedProfileUserIds,
	profileUserIds,
	teamIds,
}: ChangedTopicCacheTagsOptions): Set<string> {
	const isTopicGone = isDeleted || visibility !== previousVisibility
	const isPublicTopicGone = previousVisibility === "public" && (isDeleted || visibility !== "public")
	return new Set([
		...(isTopicGone
			? [
					toTopicPageCacheTag(topicId),
					...[...(ownerId ? [ownerId] : []), ...profileUserIds].map(toProfilePageCacheTag),
					...teamIds.map(toTeamPageCacheTag),
				]
			: []),
		...(isPublicTopicGone ? [toTopicImageCacheTag(topicId), HOME_PAGE_CACHE_TAG] : []),
		...(isHomeOrderReleased ? [HOME_PAGE_CACHE_TAG] : []),
		...releasedProfileUserIds.map(toProfilePageCacheTag),
	])
}

// the shared topic section id lists and both views of the visitors' feed
function toSharedTopicFeedKeys(): string[] {
	return [TOPIC_SECTION_IDS_KEY, HOME_CARD_IDS_KEY, toVisitorTopicFeedKey(true), toVisitorTopicFeedKey(false)]
}

/**
 * Returns the Redis key the visitors' feed is served through, one key per view.
 */
export function toVisitorTopicFeedKey(includeConsumedResources: boolean): string {
	return `${VISITOR_TOPIC_FEED_KEY_PREFIX}:${includeConsumedResources ? "all" : "unread"}`
}
