// the topic tools smoke's draft sections: the draft tools, from suggesting sources to creating the topic
import { EMPTY_TOPIC_DRAFT, type TopicDraft } from "@shared/topicPayloads"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { scans } from "../../db/schema/scans"
import { sources, topicPromptVersions, topics } from "../../db/schema/topics"
import { stopFirstScan } from "../topic/firstScanSmoke"
import { createTopicFromDraft } from "./topicDraftTools"
import { analyticsProperties, check, ownerId, runId } from "./topicToolsSmokeFixtures"

/**
 * An incomplete draft, a visitor's draft, and the owner's draft becoming the editor's topic with its first version and
 * scan.
 */
export async function checkTopicDrafts(): Promise<void> {
	// a draft with no name is not saved, a visitor may not save one, and the owner's draft becomes the editor's topic
	const emptyTopicDraft: TopicDraft = { ...EMPTY_TOPIC_DRAFT }
	const incompleteTopicDraftResult = await createTopicFromDraft({
		userId: ownerId,
		topicDraft: emptyTopicDraft,
		origin: "chat",
		analyticsProperties,
	})
	check(
		"a draft without a title or prompt is not saved",
		incompleteTopicDraftResult.status === "incomplete",
		incompleteTopicDraftResult,
	)
	const topicDraft: TopicDraft = {
		...EMPTY_TOPIC_DRAFT,
		name: `${runId} drafted topic`,
		prompt: "pickup runs after work",
		sources: [
			{ sourceOption: "reddit", value: "r/hoops" },
			{ sourceOption: "webSearch", value: "" },
		],
		visibility: "private",
		team: { teamId: crypto.randomUUID(), name: "A team the user does not lead" },
	}
	const visitorCreate = await createTopicFromDraft({
		userId: null,
		topicDraft: topicDraft,
		origin: "mcp",
		analyticsProperties,
	})
	check("a visitor may not create from a draft", visitorCreate.status === "forbidden", visitorCreate)
	const createTopicFromDraftResult = await createTopicFromDraft({
		userId: ownerId,
		topicDraft: topicDraft,
		origin: "chat",
		analyticsProperties,
	})
	const createdTopicId = createTopicFromDraftResult.status === "created" ? createTopicFromDraftResult.topicId : ""
	const [createdTopic] = await db.select().from(topics).where(eq(topics.id, createdTopicId))
	check(
		"the draft becomes a weekly wednesday topic with the draft's visibility and the editor's other defaults",
		createTopicFromDraftResult.status === "created" &&
			createdTopic?.frequency === "weekly" &&
			createdTopic.scheduledDayOfWeek === "wednesday" &&
			createdTopic.visibility === "private" &&
			createdTopic.maxTopicFindings === 10,
		createTopicFromDraftResult,
	)
	check(
		"a draft naming a team the user does not lead creates the topic and says the add was rejected",
		createTopicFromDraftResult.status === "created" && createTopicFromDraftResult.addTeamRejection !== null,
		createTopicFromDraftResult,
	)
	const createdTopicSources = await db
		.select({ kind: sources.kind })
		.from(sources)
		.where(eq(sources.topicId, createdTopicId))
	check(
		"the created topic reads the default web search and the chosen source, the chosen default once",
		createdTopicSources
			.map((topicSource) => topicSource.kind)
			.sort()
			.join(",") === "reddit,search",
		createdTopicSources,
	)
	const [createdVersion] = await db
		.select({ origin: topicPromptVersions.origin })
		.from(topicPromptVersions)
		.where(eq(topicPromptVersions.topicId, createdTopicId))
	const [firstScan] = await db.select({ id: scans.id }).from(scans).where(eq(scans.topicId, createdTopicId))
	check(
		"the created topic has a first version of the adapter's origin and an open first scan",
		createdVersion?.origin === "chat" && Boolean(firstScan),
		createdVersion,
	)

	// stop the first scan the create started and wait for it to end. the cleanup deletes the owner under it
	await stopFirstScan(createdTopicId)
}
