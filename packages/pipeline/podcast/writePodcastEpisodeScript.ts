// a Podcast Episode's script as its workflow's activities write it. the outline, each segment, the saved script,
// and what each call cost

import type { PodcastEpisodeScript } from "@carlnotes/contracts/podcast"
import { FULL_PODCAST_EPISODE_MINUTES, SHORT_PODCAST_EPISODE_MINUTES } from "@carlnotes/contracts/podcastEpisodes"
import { toHostWithoutWww } from "@carlnotes/contracts/seo"
import { db, isCurrentModelEmbedding, isFindingShown } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { findings, resources } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, inArray, sql } from "drizzle-orm"
import { readResourceText } from "../chat/retrieve"
import { loadTopicMemoryPrompt } from "../topicMemoryPrompt"
import {
	type GeneratePodcastEpisodeOutlineOptions,
	type GeneratePodcastEpisodeSegmentOptions,
	generatePodcastEpisodeOutline,
	generatePodcastEpisodeSegment,
	writeCheckedScriptDraft,
} from "./generatePodcastEpisodeScript"
import type { PlannedFinding } from "./planPodcastEpisode"
import { type PodcastEpisodeOutline, toCheckedPodcastEpisodeOutline } from "./podcastEpisodeOutline"
import {
	type PodcastEpisodeFinding,
	type PodcastEpisodeSegment,
	toChapterTurns,
	toCheckedPodcastEpisodeSegment,
	toPodcastEpisodeScript,
} from "./podcastEpisodeScript"
import {
	claimPodcastEpisodeSharedComments,
	releaseUncreditedSharedComments,
	toSharedCommentPlacements,
} from "./podcastEpisodeSharedComments"
import { assertPodcastPersonalSourcesConverted } from "./podcastPersonalSourcesMigration"

// what a script call needs. the Podcast Episode, its Topic, the user that the call bills, and the Findings to narrate
export type PodcastEpisodeScriptCallOptions = {
	podcastEpisodeId: string
	topicId: string
	billedUserId: string
	plannedFindings: PlannedFinding[]
}

// one segment's call. the outline, and the index of the segment to write
export type WritePodcastEpisodeSegmentOptions = PodcastEpisodeScriptCallOptions & {
	outline: PodcastEpisodeOutline
	segmentIndex: number
}

// the script that an earlier run of the recording saved on the row, with the outline's title and description, or null
// for a row with no saved script
async function loadSavedPodcastEpisodeScript(
	podcastEpisodeId: string,
): Promise<{ title: string | null; description: string | null; script: PodcastEpisodeScript } | null> {
	const [savedPodcastEpisode] = await db
		.select({
			title: podcastEpisodes.title,
			description: podcastEpisodes.description,
			script: podcastEpisodes.script,
		})
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	return savedPodcastEpisode?.script ? { ...savedPodcastEpisode, script: savedPodcastEpisode.script } : null
}

/**
 * Writes the Podcast Episode's outline on the billed user's key and saves its title and description on the row.
 * A recording that already saved its script, as one that the reaper started again may have, writes nothing and
 * returns an outline with no segment, so no segment is written either. Throws a RejectedScriptError if the last draft
 * does not match the outline's shape or plans nothing to narrate.
 */
export async function outlinePodcastEpisode(
	scriptCallOptions: PodcastEpisodeScriptCallOptions,
): Promise<PodcastEpisodeOutline> {
	// a saved script is kept, because the chapters that the recording already stored were recorded from it
	const savedPodcastEpisode = await loadSavedPodcastEpisodeScript(scriptCallOptions.podcastEpisodeId)
	if (savedPodcastEpisode) {
		const { title, description } = savedPodcastEpisode
		return { title: title ?? "", description: description ?? "", segments: [] }
	}

	// write the outline's drafts, and record each draft's cost before the draft is checked
	const scriptInput = await loadScriptInput(scriptCallOptions)
	const topicMemoryPrompt = await loadPodcastTopicMemoryPrompt(scriptCallOptions)
	const { maxMinutes } = scriptInput
	const findingIds = scriptInput.podcastEpisodeFindings.map((podcastEpisodeFinding) => podcastEpisodeFinding.findingId)
	const outline = await writeCheckedScriptDraft(async ({ rejectionReason, isLastScriptDraft }) => {
		await assertPodcastPersonalSourcesConverted({ topicId: scriptCallOptions.topicId })
		const { scriptDraft: outlineDraft, costDollars } = await generatePodcastEpisodeOutline({
			...scriptInput,
			topicMemoryPrompt,
			rejectionReason,
		})
		await addPodcastEpisodeCost(scriptCallOptions.podcastEpisodeId, costDollars)
		return toCheckedPodcastEpisodeOutline({ outline: outlineDraft, findingIds, maxMinutes, isLastScriptDraft })
	})

	// save the title and the description while the status is still recording
	await assertPodcastPersonalSourcesConverted({ topicId: scriptCallOptions.topicId })
	await db
		.update(podcastEpisodes)
		.set({ title: outline.title, description: outline.description })
		.where(eq(podcastEpisodes.id, scriptCallOptions.podcastEpisodeId))
	return outline
}

/**
 * Writes one segment's turns on the billed user's key, and reports how many chapters the last draft leaves out.
 * Throws a RejectedScriptError if the last draft does not match the segment's shape.
 */
export async function writePodcastEpisodeSegment({
	outline,
	segmentIndex,
	...scriptCallOptions
}: WritePodcastEpisodeSegmentOptions): Promise<PodcastEpisodeSegment> {
	// write the segment's drafts, and record each draft's cost before the draft is checked
	const scriptInput = await loadScriptInput(scriptCallOptions)
	const chapterFindingIds = new Set(outline.segments[segmentIndex]?.chapters.map(({ findingId }) => findingId))
	const topicMemoryPrompt = await loadPodcastTopicMemoryPrompt({
		...scriptCallOptions,
		plannedFindings: scriptCallOptions.plannedFindings.filter(({ findingId }) => chapterFindingIds.has(findingId)),
	})
	return writeCheckedScriptDraft(async ({ rejectionReason, isLastScriptDraft }) => {
		// write one draft of the segment, with why the draft before it was rejected
		await assertPodcastPersonalSourcesConverted({ topicId: scriptCallOptions.topicId })
		const generatePodcastEpisodeSegmentOptions = {
			...scriptInput,
			topicMemoryPrompt,
			outline,
			segmentIndex,
			rejectionReason,
		}
		const { scriptDraft: segmentDraft, costDollars } = await generatePodcastEpisodeSegment(
			generatePodcastEpisodeSegmentOptions,
		)
		await addPodcastEpisodeCost(scriptCallOptions.podcastEpisodeId, costDollars)

		// check the draft, and report how many chapters the last draft left out
		await assertPodcastPersonalSourcesConverted({ topicId: scriptCallOptions.topicId })
		const checkedSegment = toCheckedPodcastEpisodeSegment({
			segment: segmentDraft,
			outline,
			segmentIndex,
			segmentSharedComments: toSegmentSharedComments({ ...scriptInput, outline, segmentIndex }),
			isLastScriptDraft,
		})
		const leftOutChapterCount = segmentDraft.chapters.length - checkedSegment.chapters.length
		if (leftOutChapterCount > 0) {
			reportError(new Error("an episode's last draft left out a chapter"), "podcast-episode", {
				podcastEpisodeId: scriptCallOptions.podcastEpisodeId,
				leftOutChapterCount: String(leftOutChapterCount),
			})
		}
		return checkedSegment
	})
}

// the usernames a segment's draft credits, and whether its draft has closing turns about shared comments
function toSegmentSharedComments({
	sharedComments = [],
	outline,
	segmentIndex,
}: Pick<GeneratePodcastEpisodeSegmentOptions, "sharedComments" | "outline" | "segmentIndex">): {
	usernames: string[]
	hasClosingSharedComments: boolean
} {
	const { chapterSharedComments, closingSharedComments } = toSharedCommentPlacements({
		sharedComments,
		outline,
		segmentIndex,
	})
	const usernames = [...chapterSharedComments, ...closingSharedComments].flatMap(({ username }) => username ?? [])
	return { usernames, hasClosingSharedComments: closingSharedComments.length > 0 }
}

/**
 * Builds the whole script from its segments, saves it on the row, and returns how many chapters it has. A script that
 * the row already holds stays as it is, and its chapter count is returned. Throws a RejectedScriptError if the script
 * has no chapter.
 */
export async function savePodcastEpisodeScript(
	podcastEpisodeId: string,
	segments: PodcastEpisodeSegment[],
): Promise<number> {
	// stop queued script writes after personal sources activation
	await assertPodcastPersonalSourcesConverted({ podcastEpisodeId })

	// a saved script is never written over, because the chapters that the recording already stored were recorded from it
	const savedPodcastEpisode = await loadSavedPodcastEpisodeScript(podcastEpisodeId)
	if (savedPodcastEpisode) {
		return toChapterTurns(savedPodcastEpisode.script).length
	}
	const podcastEpisodeScript = toPodcastEpisodeScript(segments)
	await db.update(podcastEpisodes).set({ script: podcastEpisodeScript }).where(eq(podcastEpisodes.id, podcastEpisodeId))

	// a shared Comment counts as read only if the finished script names its author
	const chapterTurns = toChapterTurns(podcastEpisodeScript)
	const spokenText = chapterTurns.flatMap((turns) => turns.map((turn) => turn.text)).join("\n")
	await releaseUncreditedSharedComments(podcastEpisodeId, spokenText)
	return chapterTurns.length
}

/**
 * Adds what one call cost in dollars to the Podcast Episode's recorded cost.
 */
export async function addPodcastEpisodeCost(podcastEpisodeId: string, costDollars: number): Promise<void> {
	await db
		.update(podcastEpisodes)
		.set({ cost: sql`${podcastEpisodes.cost} + ${costDollars}` })
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
}

// load what a script call reads. the Topic's name and prompt, the Findings with their content, the key to bill,
// and the most minutes that the Podcast Episode may plan
async function loadScriptInput({
	podcastEpisodeId,
	topicId,
	billedUserId,
	plannedFindings,
}: PodcastEpisodeScriptCallOptions): Promise<GeneratePodcastEpisodeOutlineOptions> {
	// stop queued script reads after personal sources activation
	await assertPodcastPersonalSourcesConverted({ topicId })
	// read the Topic's own text alone, and whether the Podcast Episode is short
	// the Topic's attachments are the owner's, and a Podcast Episode reaches every listener
	const [podcastEpisodeTopic] = await db
		.select({
			name: topics.name,
			prompt: topics.prompt,
			isShort: podcastEpisodes.isShort,
			isPodcastCommentsEnabled: topics.isPodcastCommentsEnabled,
		})
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	if (!podcastEpisodeTopic) {
		throw new Error(`episode ${podcastEpisodeId} of topic ${topicId} not found`)
	}

	// load the Findings' text, the billed user's key, and the shared comments that this Podcast Episode takes. the
	// owner's switch leaves them all waiting
	const findingIds = plannedFindings.map((plannedFinding) => plannedFinding.findingId)
	const { isShort, isPodcastCommentsEnabled } = podcastEpisodeTopic
	const [podcastEpisodeFindings, litellmApiKey, sharedComments] = await Promise.all([
		loadPodcastEpisodeFindings(findingIds),
		loadOrProvisionUserLiteLLMKey(billedUserId),
		isPodcastCommentsEnabled ? claimPodcastEpisodeSharedComments({ topicId, podcastEpisodeId, isShort }) : [],
	])
	if (podcastEpisodeFindings.length === 0) {
		throw new Error(`none of the episode's findings are left on topic ${topicId}`)
	}
	// a short Podcast Episode plans fewer minutes
	await assertPodcastPersonalSourcesConverted({ topicId })
	const maxMinutes = podcastEpisodeTopic.isShort ? SHORT_PODCAST_EPISODE_MINUTES : FULL_PODCAST_EPISODE_MINUTES
	return {
		topicName: podcastEpisodeTopic.name,
		topicPrompt: podcastEpisodeTopic.prompt,
		podcastEpisodeFindings,
		sharedComments,
		litellmApiKey,
		maxMinutes,
	}
}

/**
 * Loads the Findings in the given order, each with its Resource's stored content, leaving out a Finding that a later
 * Scan filtered out or a user rated down.
 */
export async function loadPodcastEpisodeFindings(findingIds: string[]): Promise<PodcastEpisodeFinding[]> {
	const findingRows = await db
		.select({
			findingId: findings.id,
			relevanceExplanation: findings.relevanceExplanation,
			title: resources.title,
			url: resources.url,
			snippet: resources.snippet,
			contentKey: resources.contentKey,
		})
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(and(inArray(findings.id, findingIds), isFindingShown))

	// keep the planned order, and leave out a Finding that a later Scan filtered out or a user rated down
	const orderedFindingRows = findingIds.flatMap((findingId) =>
		findingRows.filter((findingRow) => findingRow.findingId === findingId),
	)
	return Promise.all(
		orderedFindingRows.map(async (findingRow) => ({
			findingId: findingRow.findingId,
			title: findingRow.title ?? findingRow.url,
			sourceHost: toHostWithoutWww(findingRow.url),
			snippet: findingRow.snippet ?? "",
			relevanceExplanation: findingRow.relevanceExplanation,
			content: await readResourceText(findingRow.contentKey, findingRow.snippet),
		})),
	)
}

// use the selected chapters' existing Resource vectors instead of paying to embed them again
async function loadPodcastTopicMemoryPrompt({
	topicId,
	plannedFindings,
}: Pick<PodcastEpisodeScriptCallOptions, "topicId" | "plannedFindings">): Promise<string> {
	const chapterVectors = await db
		.select({ embedding: resources.embedding })
		.from(resources)
		.where(
			and(
				inArray(
					resources.id,
					plannedFindings.map(({ resourceId }) => resourceId),
				),
				isCurrentModelEmbedding,
			),
		)
	return loadTopicMemoryPrompt({
		topicId,
		embeddings: chapterVectors.flatMap(({ embedding }) => (embedding ? [embedding] : [])),
		isPublicOnly: true,
	})
}
