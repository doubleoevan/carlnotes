// the topic tools smoke's source sections: adding a source with its cost, the source limit, removing a source, and
// that no source tool starts a scan
import { MAX_TOPIC_SOURCES } from "@carlnotes/contracts/topics"
import { db } from "@carlnotes/db"
import { sources } from "@carlnotes/db/schema/topics"
import { eq } from "drizzle-orm"
import { addTopicSource, removeTopicSource } from "./topicSourceTools"
import { check, otherUserId, ownerId, scanCount, topicId } from "./topicToolsSmokeFixtures"

/** Adding a source with its cost, the limit, removing a source, and that no source tool starts a scan. */
export async function checkTopicSources(otherTopicSourceId: string): Promise<void> {
	// adding a source returns its projected cost and starts no scan
	const topicScansBefore = await scanCount()
	const addTopicSourceResult = await addTopicSource({
		userId: ownerId,
		topicId,
		sourceOption: "reddit",
		value: "r/startups",
		origin: "chat",
	})
	check(
		"addSource saves with a label and a cost delta",
		addTopicSourceResult.status === "saved" &&
			addTopicSourceResult.topicSourceLabel === "reddit — r/startups" &&
			addTopicSourceResult.topicSourceCostDelta.perScanCents > 0 &&
			addTopicSourceResult.topicSourceCostDelta.perMonthCents > 0,
		addTopicSourceResult,
	)
	check("adding a source starts no scan", (await scanCount()) === topicScansBefore)
	const repeatAddTopicSourceResult = await addTopicSource({
		userId: ownerId,
		topicId,
		sourceOption: "reddit",
		value: "startups",
		origin: "mcp",
	})
	check(
		"the same source again is reported present",
		repeatAddTopicSourceResult.status === "present",
		repeatAddTopicSourceResult,
	)
	const invalidAddTopicSourceResult = await addTopicSource({
		userId: ownerId,
		topicId,
		sourceOption: "rss",
		value: "   ",
		origin: "mcp",
	})
	check("a blank value is invalid", invalidAddTopicSourceResult.status === "invalid", invalidAddTopicSourceResult)
	const otherUserAddTopicSourceResult = await addTopicSource({
		userId: otherUserId,
		topicId,
		sourceOption: "rss",
		value: "https://x.test/feed",
		origin: "mcp",
	})
	check(
		"another user cannot add a source",
		otherUserAddTopicSourceResult.status === "forbidden",
		otherUserAddTopicSourceResult,
	)

	// the topic fills to its limit and rejects one more
	for (let index = 1; index < MAX_TOPIC_SOURCES; index += 1) {
		await addTopicSource({
			userId: ownerId,
			topicId,
			sourceOption: "rss",
			value: `https://feed${index}.test/rss`,
			origin: "mcp",
		})
	}
	const pastLimitAddTopicSourceResult = await addTopicSource({
		userId: ownerId,
		topicId,
		sourceOption: "rss",
		value: "https://one-more.test/rss",
		origin: "mcp",
	})
	check(
		"a full topic rejects one more source",
		pastLimitAddTopicSourceResult.status === "limit" && pastLimitAddTopicSourceResult.limit === MAX_TOPIC_SOURCES,
		pastLimitAddTopicSourceResult,
	)

	// removing a source names it, and removing it again saves with no label. another topic's source reads as missing
	// and stays
	const sourceId = addTopicSourceResult.status === "saved" ? addTopicSourceResult.topicSourceId : ""
	const removeTopicSourceResult = await removeTopicSource({ userId: ownerId, topicId, sourceId, origin: "chat" })
	check(
		"removeSource drops the source and names it",
		removeTopicSourceResult.status === "saved" && removeTopicSourceResult.topicSourceLabel === "reddit — r/startups",
		removeTopicSourceResult,
	)
	const repeatRemoveTopicSourceResult = await removeTopicSource({ userId: ownerId, topicId, sourceId, origin: "chat" })
	check(
		"a source already gone still returns saved with no label",
		repeatRemoveTopicSourceResult.status === "saved" && repeatRemoveTopicSourceResult.topicSourceLabel === null,
		repeatRemoveTopicSourceResult,
	)
	const otherRemoved = await removeTopicSource({
		userId: ownerId,
		topicId,
		sourceId: otherTopicSourceId,
		origin: "mcp",
	})
	const [otherStillThere] = await db.select({ id: sources.id }).from(sources).where(eq(sources.id, otherTopicSourceId))
	check(
		"another topic's source reads as missing and stays",
		otherRemoved.status === "missing" && Boolean(otherStillThere),
		otherRemoved,
	)
	check("no tool started a scan", (await scanCount()) === topicScansBefore)
}
