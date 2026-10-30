// the access checks for a topic's findings: who may see a finding, and who may rate and bookmark one, alone or for
// many topics at once
import { db } from "@carlnotes/db"
import { toTopicRoleFilter } from "@carlnotes/db/contentFilters"
import { findings, scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { and, eq, inArray } from "drizzle-orm"
import {
	assertNever,
	gatedTopicColumns,
	hasSubscription,
	isVisibleAfterActivation,
	loadSubscribedTopicIds,
	subscriptionActivatedAt,
	toTopicRole,
} from "./permissions"

/**
 * Whether the user may rate a topic. The owner always may, and a non-owner only as a subscriber.
 */
export async function canRateTopic(
	userId: string | null,
	topic: Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility" | "teamId">,
): Promise<boolean> {
	// a signed-out visitor has no account to rate as
	if (!userId) {
		return false
	}

	// the owner and every team member may rate, whatever the topic's visibility
	if ((await toTopicRole(userId, topic)) !== null) {
		return true
	}

	// anyone else may rate only as a subscriber
	return isSubscriberRatable(topic.visibility) && hasSubscription(userId, topic.id)
}

/**
 * Returns whether the user may rate and bookmark findings in each of the topics, by topic id, in two reads however many
 * topics there are. The rules are canRateTopic's and canBookmarkTopic's.
 */
export async function loadTopicFindingPermissions(
	userId: string | null,
	topicRows: Pick<typeof topics.$inferSelect, "id" | "visibility">[],
): Promise<Map<string, { canRate: boolean; canBookmark: boolean }>> {
	// a visitor may do neither
	if (!userId || topicRows.length === 0) {
		return new Map(topicRows.map((topicRow) => [topicRow.id, { canRate: false, canBookmark: false }]))
	}

	// the topics the user has a role on, and the ones they subscribe to
	const topicIds = topicRows.map((topicRow) => topicRow.id)
	const [roleTopicRows, subscribedTopicIds] = await Promise.all([
		db
			.select({ id: topics.id })
			.from(topics)
			.where(and(inArray(topics.id, topicIds), toTopicRoleFilter(userId))),
		loadSubscribedTopicIds(userId, topicIds),
	])

	// a role allows both, and a subscription allows rating on a topic whose subscribers may rate
	const roleTopicIds = new Set(roleTopicRows.map((roleTopicRow) => roleTopicRow.id))
	return new Map(
		topicRows.map((topicRow) => {
			const hasRole = roleTopicIds.has(topicRow.id)
			const isRatableAsSubscriber = isSubscriberRatable(topicRow.visibility) && subscribedTopicIds.has(topicRow.id)
			return [topicRow.id, { canRate: hasRole || isRatableAsSubscriber, canBookmark: hasRole }]
		}),
	)
}

// whether a subscriber may rate a topic of this visibility. a private topic never has a subscriber
function isSubscriberRatable(visibility: (typeof topics.$inferSelect)["visibility"]): boolean {
	switch (visibility) {
		case "public":
		case "invite":
			return true
		case "private":
			return false
		// a new visibility value fails to compile here
		default:
			return assertNever(visibility)
	}
}

/**
 * A finding has the same rating rule as its topic.
 */
export async function canRateFinding(userId: string, findingId: string): Promise<boolean> {
	const topic = await loadFindingTopic(findingId)
	return topic ? canRateTopic(userId, topic) : false
}

/**
 * Whether the user may bookmark a topic finding. Bookmarks belong to the owner of the topic,
 * so seeing a finding is not enough to pin one.
 */
export async function canBookmarkFinding(userId: string, findingId: string): Promise<boolean> {
	const topic = await loadFindingTopic(findingId)
	return topic ? canBookmarkTopic(userId, topic) : false
}

/**
 * Whether the user may bookmark a topic's findings: its owner and every member of a team that holds it may.
 */
export async function canBookmarkTopic(
	userId: string | null,
	topic: Pick<typeof topics.$inferSelect, "id" | "ownerId" | "teamId">,
): Promise<boolean> {
	return (await toTopicRole(userId, topic)) !== null
}

/**
 * Whether the user may see a topic finding. A signed-out visitor passes it for a public topic alone.
 */
export async function isTopicFindingVisible(userId: string | null, findingId: string): Promise<boolean> {
	// a missing finding is invisible to everyone
	const topic = await loadFindingTopic(findingId)
	if (!topic) {
		return false
	}

	// the owner and every team member see the topic's full history
	if ((await toTopicRole(userId, topic)) !== null) {
		return true
	}

	// anyone else sees a public topic outright, never a private one
	switch (topic.visibility) {
		case "public":
			return true
		case "invite":
			// an invite topic opens on a subscription, which a signed-out visitor holds none of
			if (!userId) {
				return false
			}
			return isVisibleAfterActivation(topic.scanStartedAt, await subscriptionActivatedAt(userId, topic.id))
		case "private":
			return false
		// a new visibility value fails to compile here
		default:
			return assertNever(topic.visibility)
	}
}

// the id, owner, and visibility of a topic finding's topic plus its scan's start time
async function loadFindingTopic(findingId: string): Promise<
	| (Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility" | "teamId"> & {
			scanStartedAt: (typeof scans.$inferSelect)["startedAt"]
	  })
	| undefined
> {
	// one join maps from the finding to its topic and to the scan that produced it
	const [topic] = await db
		.select({ ...gatedTopicColumns, scanStartedAt: scans.startedAt })
		.from(findings)
		.innerJoin(topics, eq(findings.topicId, topics.id))
		.innerJoin(scans, eq(findings.scanId, scans.id))
		.where(eq(findings.id, findingId))
		.limit(1)
	// undefined when the finding id matches nothing
	return topic
}
