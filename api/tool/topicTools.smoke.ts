// a live smoke test for the topic tools: the gate inside them, the prompt versions they write, adding and removing
// a source, and that no tool starts a scan
// run it with: doppler run -- bun api/tool/topicTools.smoke.ts. needs Doppler secrets and no model
import { MAX_TOPIC_SOURCES, type UpdateTopicPayload } from "@shared/contracts"
import { count, eq, inArray } from "drizzle-orm"
import { connectionPool, db } from "../../db"
import { scans, sources, topicPromptVersions, topics, users } from "../../db/schema"
import { updateTopic } from "../topic/topics"
import { addTopicSource, createTopicFromDraft, removeTopicSource, updateTopicPrompt } from "./topicTools"

// one id per run, and every fixture id derives from it. two runs at once never collide
const runId = `tools-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`
const ownerId = `${runId}-owner`
const outsiderId = `${runId}-outsider`
const topicId = `${runId}-topic`
const otherTopicId = `${runId}-other`

// each check reports its own line, and one failure fails the run
let failureCount = 0
function check(label: string, isTestPassing: boolean, detail?: unknown): void {
	// print one line for a pass, and the detail for a failure
	if (isTestPassing) {
		console.log(`  ok  ${label}`)
		return
	}
	failureCount += 1
	console.error(`FAIL  ${label}`, detail ?? "")
}

// one account, named by its own id
function toUserRow(id: string): typeof users.$inferInsert {
	return { id, name: id, email: `${id}@example.com`, username: id, usernameNormalized: id }
}

// how many versions the topic holds now
async function versionCount(): Promise<number> {
	const [countRow] = await db
		.select({ count: count() })
		.from(topicPromptVersions)
		.where(eq(topicPromptVersions.topicId, topicId))
	return countRow?.count ?? 0
}
// how many scans the topic holds now
async function scanCount(): Promise<number> {
	const [countRow] = await db.select({ count: count() }).from(scans).where(eq(scans.topicId, topicId))
	return countRow?.count ?? 0
}

// the owner, an outsider, a weekly topic with one succeeded scan, and a second topic holding one source
async function seed(): Promise<string> {
	await db.insert(users).values([toUserRow(ownerId), toUserRow(outsiderId)])
	await db.insert(topics).values([
		{
			id: topicId,
			ownerId,
			name: `${runId} topic`,
			prompt: "the first prompt",
			visibility: "public",
			frequency: "weekly",
		},
		{ id: otherTopicId, ownerId, name: `${runId} other`, prompt: "another", visibility: "private" },
	])
	await db.insert(scans).values({ topicId, ownerId, status: "succeeded", cost: "0.20" })

	// insert the other topic's source and return its id
	const [otherTopicSource] = await db
		.insert(sources)
		.values({ topicId: otherTopicId, kind: "rss", config: { url: "https://other.test/feed" }, status: "ready" })
		.returning({ id: sources.id })
	return otherTopicSource?.id ?? ""
}

// delete both users. every other fixture row cascades from them
async function cleanUp(): Promise<void> {
	await db.delete(users).where(inArray(users.id, [ownerId, outsiderId]))
}

// what the editor's save sends, with the prompt as given and no invites or sources
function toEditorPayload(prompt: string): UpdateTopicPayload {
	return {
		name: `${runId} topic`,
		prompt,
		tags: [],
		frequency: "weekly" as const,
		scheduledTime: "09:00",
		scheduledDayOfWeek: "monday" as const,
		visibility: "public" as const,
		maxResults: 10,
		inviteEmails: [],
		sources: [],
	}
}

// the analytics shape updateTopic asks for
const analyticsProperties = {
	plan: "free",
	platform: "desktop" as const,
	browserPlatform: "other" as const,
	isInAppBrowser: false,
}

try {
	const otherTopicSourceId = await seed()

	// the gate inside the tools rejects an outsider and a visitor, and a missing topic reads as missing
	const outsiderEditResult = await updateTopicPrompt({ userId: outsiderId, topicId, prompt: "no", origin: "chat" })
	check(
		"a reader without edit rights is rejected inside the tool",
		outsiderEditResult.status === "forbidden",
		outsiderEditResult,
	)
	const visitorEditResult = await updateTopicPrompt({ userId: null, topicId, prompt: "no", origin: "mcp" })
	check("a visitor is rejected inside the tool", visitorEditResult.status === "forbidden", visitorEditResult)
	const missingTopicEditResult = await updateTopicPrompt({
		userId: ownerId,
		topicId: "nope",
		prompt: "no",
		origin: "mcp",
	})
	check("a missing topic reads as missing", missingTopicEditResult.status === "missing", missingTopicEditResult)
	check("the rejected edits wrote no version", (await versionCount()) === 0)

	// the owner's edit writes a version, and the same text again writes none
	const ownerEditResult = await updateTopicPrompt({
		userId: ownerId,
		topicId,
		prompt: "the second prompt",
		origin: "chat",
	})
	const [version] = await db.select().from(topicPromptVersions).where(eq(topicPromptVersions.topicId, topicId))
	check(
		"the owner's edit saves and versions with its origin",
		ownerEditResult.status === "saved" && version?.origin === "chat" && version.prompt === "the second prompt",
		ownerEditResult,
	)
	await updateTopicPrompt({ userId: ownerId, topicId, prompt: "the second prompt", origin: "chat" })
	check("the same prompt again writes no version", (await versionCount()) === 1)

	// the editor's save without a prompt change writes no version, and a changed prompt writes one with origin editor
	const unchangedSaveResult = await updateTopic(
		ownerId,
		topicId,
		toEditorPayload("the second prompt"),
		analyticsProperties,
	)
	check(
		"an editor's save without a prompt change writes no version",
		unchangedSaveResult.status === "saved" && (await versionCount()) === 1,
		unchangedSaveResult,
	)
	const changedSaveResult = await updateTopic(
		ownerId,
		topicId,
		toEditorPayload("the third prompt"),
		analyticsProperties,
	)
	const versions = await db.select().from(topicPromptVersions).where(eq(topicPromptVersions.topicId, topicId))
	check(
		"an editor's changed prompt versions with origin editor",
		changedSaveResult.status === "saved" &&
			versions.some((versionRow) => versionRow.origin === "editor" && versionRow.prompt === "the third prompt"),
		versions,
	)

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
	const outsiderAddTopicSourceResult = await addTopicSource({
		userId: outsiderId,
		topicId,
		sourceOption: "rss",
		value: "https://x.test/feed",
		origin: "mcp",
	})
	check(
		"an outsider cannot add a source",
		outsiderAddTopicSourceResult.status === "forbidden",
		outsiderAddTopicSourceResult,
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

	// a draft with no name is not saved, a visitor may not save one, and the owner's draft becomes the editor's topic
	const emptyTopicDraft = { name: "", prompt: "", sources: [], inviteEmails: [] }
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
	const topicDraft = {
		name: `${runId} drafted topic`,
		prompt: "pickup runs after work",
		sources: [
			{ sourceOption: "reddit" as const, value: "r/hoops" },
			{ sourceOption: "webSearch" as const, value: "" },
		],
		inviteEmails: [],
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
		"the draft becomes a weekly wednesday topic shared by invite with the editor's defaults",
		createTopicFromDraftResult.status === "created" &&
			createdTopic?.frequency === "weekly" &&
			createdTopic.scheduledDayOfWeek === "wednesday" &&
			createdTopic.visibility === "invite" &&
			createdTopic.maxResults === 10,
		createTopicFromDraftResult,
	)
	const createdTopicSources = await db
		.select({ kind: sources.kind })
		.from(sources)
		.where(eq(sources.topicId, createdTopicId))
	check(
		"the createTopicFromDraftResult topic reads the default web search and the chosen source, the chosen default once",
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
		"the createTopicFromDraftResult topic has a first version of the adapter's origin and an open first scan",
		createdVersion?.origin === "chat" && Boolean(firstScan),
		createdVersion,
	)
} finally {
	// delete the fixtures whatever happened, then close the pool. an open pool keeps the process alive
	await cleanUp()
	await connectionPool.end()
}

// one failure fails the run
if (failureCount > 0) {
	console.error(`${failureCount} check(s) failed`)
	process.exit(1)
}
console.log("topic tools smoke passed")
