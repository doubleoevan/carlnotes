// a Podcast Episode's script as its workflow's activities write it. the outline, each segment, the saved script,
// and what each call cost
import { reportError } from "@shared/monitoring"
import { FULL_PODCAST_EPISODE_MINUTES, SHORT_PODCAST_EPISODE_MINUTES } from "@shared/podcastEpisodes"
import { toHostWithoutWww } from "@shared/seo"
import { eq, inArray, sql } from "drizzle-orm"
import { db } from "../../db"
import { findings, podcastEpisodes, resources, topics } from "../../db/schema"
import { readResourceText } from "../chat/retrieve"
import { loadOrProvisionUserLiteLLMKey } from "../litellm"
import {
	type GeneratePodcastEpisodeOutlineOptions,
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

/**
 * Writes the Podcast Episode's outline on the billed user's key and saves its title and description on the row.
 * Throws a RejectedScriptError if the last draft does not match the outline's shape or plans nothing to narrate.
 */
export async function outlinePodcastEpisode(
	scriptCallOptions: PodcastEpisodeScriptCallOptions,
): Promise<PodcastEpisodeOutline> {
	// write the outline's drafts, and record each draft's cost before the draft is checked
	const scriptInput = await loadScriptInput(scriptCallOptions)
	const { maxMinutes } = scriptInput
	const findingIds = scriptInput.podcastEpisodeFindings.map((podcastEpisodeFinding) => podcastEpisodeFinding.findingId)
	const outline = await writeCheckedScriptDraft(async ({ rejectionReason, isLastScriptDraft }) => {
		const { scriptDraft: outlineDraft, costDollars } = await generatePodcastEpisodeOutline({
			...scriptInput,
			rejectionReason,
		})
		await addPodcastEpisodeCost(scriptCallOptions.podcastEpisodeId, costDollars)
		return toCheckedPodcastEpisodeOutline({ outline: outlineDraft, findingIds, maxMinutes, isLastScriptDraft })
	})

	// save the title and the description while the status is still recording
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
	return writeCheckedScriptDraft(async ({ rejectionReason, isLastScriptDraft }) => {
		// write one draft of the segment, with why the draft before it was rejected
		const generatePodcastEpisodeSegmentOptions = { ...scriptInput, outline, segmentIndex, rejectionReason }
		const { scriptDraft: segmentDraft, costDollars } = await generatePodcastEpisodeSegment(
			generatePodcastEpisodeSegmentOptions,
		)
		await addPodcastEpisodeCost(scriptCallOptions.podcastEpisodeId, costDollars)

		// check the draft, and report how many chapters the last draft left out
		const checkedSegment = toCheckedPodcastEpisodeSegment({
			segment: segmentDraft,
			outline,
			segmentIndex,
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

/**
 * Builds the whole script from its segments, saves it on the row, and returns how many chapters it has.
 * Throws a RejectedScriptError if the script has no chapter.
 */
export async function savePodcastEpisodeScript(
	podcastEpisodeId: string,
	segments: PodcastEpisodeSegment[],
): Promise<number> {
	const podcastEpisodeScript = toPodcastEpisodeScript(segments)
	await db.update(podcastEpisodes).set({ script: podcastEpisodeScript }).where(eq(podcastEpisodes.id, podcastEpisodeId))
	return toChapterTurns(podcastEpisodeScript).length
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
	// read the Topic's own text alone, and whether the Podcast Episode is short.
	// the Topic's attachments are the owner's, and a Podcast Episode reaches every listener
	const [podcastEpisodeTopic] = await db
		.select({ name: topics.name, prompt: topics.prompt, isShort: podcastEpisodes.isShort })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	if (!podcastEpisodeTopic) {
		throw new Error(`episode ${podcastEpisodeId} of topic ${topicId} not found`)
	}

	// load the Findings' text and the billed user's key
	const findingIds = plannedFindings.map((plannedFinding) => plannedFinding.findingId)
	const [podcastEpisodeFindings, litellmApiKey] = await Promise.all([
		loadPodcastEpisodeFindings(findingIds),
		loadOrProvisionUserLiteLLMKey(billedUserId),
	])
	if (podcastEpisodeFindings.length === 0) {
		throw new Error(`none of the episode's findings are left on topic ${topicId}`)
	}
	// a short Podcast Episode plans fewer minutes
	const maxMinutes = podcastEpisodeTopic.isShort ? SHORT_PODCAST_EPISODE_MINUTES : FULL_PODCAST_EPISODE_MINUTES
	return {
		topicName: podcastEpisodeTopic.name,
		topicPrompt: podcastEpisodeTopic.prompt,
		podcastEpisodeFindings,
		litellmApiKey,
		maxMinutes,
	}
}

// load the Findings for the script prompts in the planned order, each with its Resource's stored content
async function loadPodcastEpisodeFindings(findingIds: string[]): Promise<PodcastEpisodeFinding[]> {
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
		.where(inArray(findings.id, findingIds))

	// keep the planned order, and leave out a Finding that a later Scan filtered out
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
