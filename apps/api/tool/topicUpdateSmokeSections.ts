// the topic tools smoke's update sections: the prompt and field updates through the tools, and what they reject

import { db } from "@carlnotes/db"
import { topicPromptVersions, topics } from "@carlnotes/db/schema/topics"
import { eq } from "drizzle-orm"
import { TEST_ANALYTICS_PROPERTIES } from "../analyticsTestFixtures"
import { updateTopic } from "../topic/saveTopic"
import { updateTopicFields, updateTopicPrompt } from "./topicTools"
import { check, otherUserId, ownerId, toEditorPayload, topicId, versionCount } from "./topicToolsSmokeFixtures"

/**
 * The gate inside the prompt and settings tools, the fields a settings save writes, and the versions a prompt edit
 * writes.
 */
export async function checkTopicUpdates(): Promise<void> {
	// the gate inside the tools rejects a user who doesn't own the topic and a visitor, and a missing topic reads as missing
	const otherUserEditResult = await updateTopicPrompt({ userId: otherUserId, topicId, prompt: "no", origin: "chat" })
	check(
		"a reader without edit rights is rejected inside the tool",
		otherUserEditResult.status === "forbidden",
		otherUserEditResult,
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

	// the settings tool is gated the same way, and writes only the fields it is given
	const otherUserFieldsResult = await updateTopicFields({
		userId: otherUserId,
		topicId,
		topicFields: { maxTopicFindings: 15 },
		promptVersionOrigin: "chat",
	})
	check(
		"a reader without edit rights cannot change the settings",
		otherUserFieldsResult.status === "forbidden",
		otherUserFieldsResult,
	)
	const emptyFieldsResult = await updateTopicFields({
		userId: ownerId,
		topicId,
		topicFields: {},
		promptVersionOrigin: "chat",
	})
	check("a settings call naming no field saves nothing", emptyFieldsResult.status === "empty", emptyFieldsResult)
	const ownerFieldsResult = await updateTopicFields({
		userId: ownerId,
		topicId,
		topicFields: { tags: ["hoops"], maxTopicFindings: 15 },
		promptVersionOrigin: "chat",
	})
	const [topicSettingsRow] = await db
		.select({ tags: topics.tags, maxTopicFindings: topics.maxTopicFindings, frequency: topics.frequency })
		.from(topics)
		.where(eq(topics.id, topicId))
	check(
		"the owner's settings save writes the named fields and keeps the rest",
		ownerFieldsResult.status === "saved" &&
			topicSettingsRow?.maxTopicFindings === 15 &&
			topicSettingsRow.tags?.[0] === "hoops" &&
			topicSettingsRow.frequency === "weekly",
		{ ownerFieldsResult, topicSettingsRow },
	)

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
		TEST_ANALYTICS_PROPERTIES,
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
		TEST_ANALYTICS_PROPERTIES,
	)
	const versions = await db.select().from(topicPromptVersions).where(eq(topicPromptVersions.topicId, topicId))
	check(
		"an editor's changed prompt versions with origin editor",
		changedSaveResult.status === "saved" &&
			versions.some((versionRow) => versionRow.origin === "editor" && versionRow.prompt === "the third prompt"),
		versions,
	)
}
