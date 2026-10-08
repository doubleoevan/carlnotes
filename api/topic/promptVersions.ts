// the prompt version write every prompt save shares, the editor's and the topic tools' alike
import type { promptVersionOrigins } from "@shared/enums"
import type { DbTransaction } from "../../db"
import { topicPromptVersions } from "../../db/schema"

// where a prompt version came from
export type PromptVersionOrigin = (typeof promptVersionOrigins)[number]

/**
 * Appends one prompt version inside the prompt's own transaction, skipping a prompt equal to the one before it.
 */
export async function savePromptVersion(
	transaction: DbTransaction,
	version: { topicId: string; prompt: string; userId: string; origin: PromptVersionOrigin; previousPrompt?: string },
): Promise<void> {
	// skip an unchanged prompt
	if (version.previousPrompt === version.prompt) {
		return
	}
	await transaction.insert(topicPromptVersions).values({
		topicId: version.topicId,
		prompt: version.prompt,
		savedByUserId: version.userId,
		origin: version.origin,
	})
}
