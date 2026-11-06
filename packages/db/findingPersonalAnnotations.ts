// private Finding text is selected by the authenticated sender before any visibility check
import { decryptPrivateText } from "@carlnotes/server/privateText"
import { and, eq, inArray } from "drizzle-orm"
import { isTopicFindingVisible } from "./findingPermissions"
import { db } from "./index"
import { findingPersonalAnnotations } from "./schema/personalSources"
import { findings } from "./schema/scans"

/**
 * Loads only the authenticated sender's current annotation on a visible Finding.
 */
export async function loadFindingPersonalAnnotation({
	userId,
	topicId,
	findingId,
}: {
	userId: string
	topicId: string
	findingId: string
}): Promise<{ text: string | null; expiresAt: string | null }> {
	// require the exact sender and destination before considering any private content
	const [annotation] = await db
		.select({ annotation: findingPersonalAnnotations })
		.from(findingPersonalAnnotations)
		.innerJoin(
			findings,
			and(
				eq(findings.id, findingPersonalAnnotations.findingId),
				eq(findings.topicId, findingPersonalAnnotations.topicId),
			),
		)
		.where(
			and(
				eq(findingPersonalAnnotations.userId, userId),
				eq(findingPersonalAnnotations.findingId, findingId),
				eq(findingPersonalAnnotations.topicId, topicId),
			),
		)
	if (!annotation || !(await isTopicFindingVisible(userId, findingId))) {
		return { text: null, expiresAt: null }
	}

	// decrypt only the authenticated sender's row after the Finding visibility check
	const text = decryptPrivateText(annotation.annotation.encryptedText)
	if (text === null) {
		throw new Error("Private Finding annotation is temporarily unavailable")
	}
	return { text, expiresAt: null }
}

/**
 * Loads the authenticated sender's annotations on a page of Findings that the caller already read under its access
 * rules, by Finding id, in one query. A row that cannot be decrypted is left out.
 */
export async function loadFindingPersonalAnnotations({
	userId,
	findingIds,
}: {
	userId: string
	findingIds: string[]
}): Promise<Map<string, string>> {
	// an empty page has nothing to read
	if (!findingIds.length) {
		return new Map()
	}

	// require the exact sender and the Finding's own Topic before considering any private content
	const annotationRows = await db
		.select({
			findingId: findingPersonalAnnotations.findingId,
			encryptedText: findingPersonalAnnotations.encryptedText,
		})
		.from(findingPersonalAnnotations)
		.innerJoin(
			findings,
			and(
				eq(findings.id, findingPersonalAnnotations.findingId),
				eq(findings.topicId, findingPersonalAnnotations.topicId),
			),
		)
		.where(
			and(eq(findingPersonalAnnotations.userId, userId), inArray(findingPersonalAnnotations.findingId, findingIds)),
		)

	// decrypt the sender's rows, and skip one a rotated key cannot read
	const textByFindingId = new Map<string, string>()
	for (const annotationRow of annotationRows) {
		const text = decryptPrivateText(annotationRow.encryptedText)
		// store the text of a row that decrypted
		if (text !== null) {
			textByFindingId.set(annotationRow.findingId, text)
		}
	}
	return textByFindingId
}
