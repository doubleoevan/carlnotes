// shared manual forwarding setup contains no receiving credentials or mutations
import type { PersonalSourcesEmailSetupResponse } from "@carlnotes/contracts/personalSourcesAccounts"
import {
	isPersonalSourcesEmailEnabled,
	readPersonalSourcesEmailAddress,
} from "@carlnotes/server/personalSourcesSettings"
import { eq } from "drizzle-orm"
import { db } from "./index"
import { decidePersonalSourcesCapability } from "./personalSourcesAuthority"
import { topics } from "./schema/topics"

/**
 * Returns manual forwarding availability and the current Topic name to an authorized sender.
 */
export async function loadPersonalSourcesEmailSetup({
	userId,
	topicId,
}: {
	userId: string
	topicId: string
}): Promise<PersonalSourcesEmailSetupResponse | null> {
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || !(await decidePersonalSourcesCapability({ userId, topic, capability: "personalSources:read" }))) {
		return null
	}
	return {
		topicName: topic.name,
		address: isPersonalSourcesEmailEnabled() ? readPersonalSourcesEmailAddress() : null,
		canReceive:
			isPersonalSourcesEmailEnabled() &&
			(await decidePersonalSourcesCapability({ userId, topic, capability: "personalSources:email" })),
	}
}
