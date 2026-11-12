// the stubs that the film's chapter image tests share: the scene writer, the image generation, the moderation,
// storage, the owner's key, the error reports, and the spend cutoff, with the connection pool returning the chapters'
// read
import { spyOn } from "bun:test"
import { type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import * as storage from "@carlnotes/db/store"
import * as litellm from "@carlnotes/models/litellm"
import * as moderation from "@carlnotes/models/moderation"
import * as monitoring from "@carlnotes/server/monitoring"
import * as topicImageOriginals from "../topicImages/renderTopicImageOriginal"
import type { TopicImageOriginal } from "../topicImages/topicImageFiles"
import * as topicImageScenes from "../topicImages/writeTopicImageScene"

// a generated original, and the jpeg an earlier render stored
export const ORIGINAL: TopicImageOriginal = { jpegBytes: new Uint8Array([1, 2, 3]), width: 1280, height: 720 }
export const STORED_JPEG = new Uint8Array([4, 5, 6])

// the film's podcast episode and its owner, who pays
export const OWNER_BILLING = { podcastEpisodeId: "episode-1", ownerId: "owner-1", isPlatformBilled: false }

// a spy on one module function
type Spy = ReturnType<typeof spyOn>

// the spies the tests read
export type ChapterImageGenerationSpies = {
	writeScene: Spy
	renderOriginal: Spy
	classifyImage: Spy
	// storage
	attachmentExists: Spy
	upload: Spy
	// the owner's key, the error reports, and the spend cutoff
	provisionKey: Spy
	reportError: Spy
	isCutoffPassed: Spy
}

/**
 * Stubs an image generation that succeeds on the owner's key, an image the moderation passes, storage that holds
 * nothing yet and reads a Resource Image's key back as its bytes, and an owner within the spend cutoff. Returns the
 * spies.
 */
export function stubChapterImageGenerations(): ChapterImageGenerationSpies {
	// a scene, its generated original, and a moderation pass
	const writeScene = spyOn(topicImageScenes, "writeTopicImageScene").mockResolvedValue("A harbor at dusk.")
	const renderOriginal = spyOn(topicImageOriginals, "renderTopicImageOriginal").mockResolvedValue(ORIGINAL)
	const classifyImage = spyOn(moderation, "classifyImage").mockResolvedValue({
		outcome: "classified",
		verdict: { isViolation: false, category: null },
	})

	// storage that holds nothing yet, and reads a Resource Image's key back as its bytes
	const attachmentExists = spyOn(storage, "attachmentExists").mockResolvedValue(false)
	const upload = spyOn(storage, "uploadAttachment").mockResolvedValue(undefined)
	spyOn(storage, "getAttachmentBytes").mockImplementation(async (objectKey: string) =>
		objectKey.startsWith("resources/") ? new TextEncoder().encode(objectKey) : STORED_JPEG,
	)

	// the owner's key, the error reports, and an owner within the spend cutoff
	const provisionKey = spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("sk-owner")
	const reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const isCutoffPassed = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(false)
	return {
		writeScene,
		renderOriginal,
		classifyImage,
		attachmentExists,
		upload,
		provisionKey,
		reportError,
		isCutoffPassed,
	}
}

/**
 * Stubs the connection pool so that the chapters' read returns a row for each position it names: the chapter's title,
 * its Resource's title, and its Finding's public relevance explanation. Returns the queries that the connection pool
 * was sent.
 */
export function stubChapterReads(): SentQuery[] {
	return stubConnectionPool(({ text, values }) => {
		// a write returns nothing
		if (!text.startsWith("select")) {
			return []
		}

		// the read returns one row for each position it names
		const positions = values.filter((value): value is number => typeof value === "number")
		return positions.map((position) => [
			position,
			`Chapter ${position}`,
			`Finding ${position}`,
			`Why ${position} matters`,
		])
	})
}

/**
 * Returns the film row's writes that add an image generation's cost.
 */
export function toCostUpdates(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter((sentQuery) => sentQuery.text.startsWith('update "topic_podcast_episode_videos"'))
}
