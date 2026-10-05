// the model calls that write a Podcast Episode's script drafts, the prompts that they send,
// and the retry that writes drafts until one passes its checks. a call returns its draft unchecked, with its cost
import { PODCAST_EPISODE_DESCRIPTION_MAX_CHARS, PODCAST_EPISODE_TITLE_MAX_CHARS } from "@shared/contracts"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "@shared/podcastEpisodes"
import { generateText, NoObjectGeneratedError, Output } from "ai"
import { PREMIUM_COST_PER_MILLION_TOKENS, tokenCost } from "../budget"
import { scoreModel } from "../models"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "../prompts/fetch"
import { writePrompt } from "../prompts/write"
import {
	GOODBYE_OPENING_TURNS,
	type PodcastEpisodeFinding,
	type PodcastEpisodeOutline,
	type PodcastEpisodeSegment,
	podcastEpisodeOutlinePayload,
	podcastEpisodeSegmentPayload,
	RejectedScriptError,
	toGoodbyeOpeningLine,
} from "./podcastEpisodeScript"

// the script model reasons before it writes. low effort keeps a call to seconds instead of over a minute
const SCRIPT_PROVIDER_OPTIONS = { openai: { reasoningEffort: "low" } }

// how many words a segment's prompt asks for per planned minute, below the hosts' speaking rate.
// a model writes past a word count more often than short of it
const PLANNED_WORDS_PER_MINUTE = 125

// how many words of a Resource's stored content reach a prompt
export const MAX_RESOURCE_WORDS = 1500

// the most drafts that one script call writes
const SCRIPT_DRAFT_ATTEMPTS = 3

// what a first draft's prompt says in place of a rejection
const NO_REJECTION_REASON = "none"

// what one draft is told. why the previous draft was rejected, and whether it is the call's last draft
export type ScriptDraftAttempt = { rejectionReason?: string; isLastScriptDraft: boolean }

// a model call's script draft with what the call cost in dollars
export type ScriptCallResult<ScriptDraft> = { scriptDraft: ScriptDraft; costDollars: number }

// one outline call. the Topic's name and prompt, the Findings to plan, and the litellm key to bill
export type GeneratePodcastEpisodeOutlineOptions = {
	topicName: string
	topicPrompt: string
	podcastEpisodeFindings: PodcastEpisodeFinding[]
	litellmApiKey?: string
	// why the previous draft was rejected
	rejectionReason?: string
}

// one segment call. what an outline call takes, the outline, and the index of the segment to write
export type GeneratePodcastEpisodeSegmentOptions = GeneratePodcastEpisodeOutlineOptions & {
	outline: PodcastEpisodeOutline
	segmentIndex: number
}

/**
 * Writes one draft of the Podcast Episode's outline and returns the draft with what the model call cost.
 */
export async function generatePodcastEpisodeOutline(
	generatePodcastEpisodeOutlineOptions: GeneratePodcastEpisodeOutlineOptions,
): Promise<ScriptCallResult<PodcastEpisodeOutline>> {
	// write the prompt and ask the model for an outline of the schema's shape
	const outlinePrompt = await buildOutlinePrompt(generatePodcastEpisodeOutlineOptions)
	const { output: outlineDraft, usage } = await generateText({
		model: scoreModel(generatePodcastEpisodeOutlineOptions.litellmApiKey),
		output: Output.object({ schema: podcastEpisodeOutlinePayload }),
		prompt: outlinePrompt.prompt,
		providerOptions: SCRIPT_PROVIDER_OPTIONS,
		...promptTelemetry(outlinePrompt),
	}).catch(throwScriptDraftError)

	// map each chapter's Finding number back to its id, and price the call
	const { podcastEpisodeFindings } = generatePodcastEpisodeOutlineOptions
	const segments = outlineDraft.segments.map((segment) => ({
		...segment,
		chapters: segment.chapters.map(({ findingNumber, ...chapter }) => ({
			...chapter,
			findingId: toListedFindingId(findingNumber, podcastEpisodeFindings),
		})),
	}))
	const costDollars = tokenCost(usage.totalTokens ?? 0, PREMIUM_COST_PER_MILLION_TOKENS)
	return { scriptDraft: { ...outlineDraft, segments }, costDollars }
}

/**
 * Writes one draft of a segment's turns against the outline and returns the draft with what the model call cost.
 */
export async function generatePodcastEpisodeSegment(
	generatePodcastEpisodeSegmentOptions: GeneratePodcastEpisodeSegmentOptions,
): Promise<ScriptCallResult<PodcastEpisodeSegment>> {
	// write the prompt and ask the model for a segment of the schema's shape
	const segmentPrompt = await buildSegmentPrompt(generatePodcastEpisodeSegmentOptions)
	const { output: segmentDraft, usage } = await generateText({
		model: scoreModel(generatePodcastEpisodeSegmentOptions.litellmApiKey),
		output: Output.object({ schema: podcastEpisodeSegmentPayload }),
		prompt: segmentPrompt.prompt,
		providerOptions: SCRIPT_PROVIDER_OPTIONS,
		...promptTelemetry(segmentPrompt),
	}).catch(throwScriptDraftError)

	// map each chapter's Finding number back to its id, and price the call
	const segmentFindings = toSegmentFindings(generatePodcastEpisodeSegmentOptions)
	const chapters = segmentDraft.chapters.map(({ findingNumber, ...chapter }) => ({
		...chapter,
		findingId: toListedFindingId(findingNumber, segmentFindings),
	}))
	const costDollars = tokenCost(usage.totalTokens ?? 0, PREMIUM_COST_PER_MILLION_TOKENS)
	return { scriptDraft: { ...segmentDraft, chapters }, costDollars }
}

/**
 * Throws a schema mismatch as a RejectedScriptError that says what did not match, and any other error as it is.
 */
export function throwScriptDraftError(error: unknown): never {
	// ponytail: a draft that is rejected here returns no cost, so its tokens are not added to the Podcast Episode's cost.
	// read the usage from the error if these rejections turn out to be common
	if (NoObjectGeneratedError.isInstance(error)) {
		const schemaReason = error.cause instanceof Error ? error.cause.message : error.message
		throw new RejectedScriptError(`the draft does not match the schema: ${schemaReason.slice(0, 500)}`)
	}
	throw error
}

/**
 * Returns the id of the Finding that a prompt listed under the number, or the number as text if the prompt listed none.
 */
export function toListedFindingId(findingNumber: number, listedFindings: PodcastEpisodeFinding[]): string {
	return listedFindings[findingNumber - 1]?.findingId ?? String(findingNumber)
}

/**
 * Writes drafts until a draft passes its checks, telling each draft why the draft before it was rejected.
 * Throws the last RejectedScriptError once the drafts run out.
 */
export async function writeCheckedScriptDraft<ScriptDraft>(
	writeScriptDraft: (scriptDraftAttempt: ScriptDraftAttempt) => Promise<ScriptDraft>,
): Promise<ScriptDraft> {
	// write a draft, and write the next draft with why this draft was rejected
	let rejectionReason: string | undefined
	for (let attempt = 1; ; attempt++) {
		try {
			return await writeScriptDraft({ rejectionReason, isLastScriptDraft: attempt >= SCRIPT_DRAFT_ATTEMPTS })
		} catch (error) {
			// retry only a rejected draft, and only while drafts are left
			if (!(error instanceof RejectedScriptError) || attempt >= SCRIPT_DRAFT_ATTEMPTS) {
				throw error
			}
			rejectionReason = error.message
		}
	}
}

/**
 * Builds the outline prompt from outline-podcast-episode.md.
 */
export async function buildOutlinePrompt({
	topicName,
	topicPrompt,
	podcastEpisodeFindings,
	rejectionReason,
}: GeneratePodcastEpisodeOutlineOptions): Promise<BuiltPrompt> {
	// fetch the outline template, and fill it with the Topic, the Findings, the hosts, and the limits
	const { template, name, registryPrompt } = await fetchPromptTemplate("outline-podcast-episode")
	const prompt = writePrompt(
		template,
		{
			topicName,
			topicPrompt,
			findingsBlock: toFindingsBlock(podcastEpisodeFindings),
			rejectionReason: rejectionReason ?? NO_REJECTION_REASON,
		},
		{
			hostsBlock: await toHostsBlock(),
			titleMaxChars: String(PODCAST_EPISODE_TITLE_MAX_CHARS),
			descriptionMaxChars: String(PODCAST_EPISODE_DESCRIPTION_MAX_CHARS),
		},
	)
	return { prompt, name, registryPrompt }
}

/**
 * Builds one segment's prompt from its template, with the whole outline and the segment's own Findings.
 */
export async function buildSegmentPrompt(
	generatePodcastEpisodeSegmentOptions: GeneratePodcastEpisodeSegmentOptions,
): Promise<BuiltPrompt> {
	// fetch the segment template, and list the segment's own Findings
	const { template, name, registryPrompt } = await fetchPromptTemplate("write-podcast-episode-segment")
	const { outline, segmentIndex, podcastEpisodeFindings } = generatePodcastEpisodeSegmentOptions
	const segmentFindings = toSegmentFindings(generatePodcastEpisodeSegmentOptions)

	// write the prompt. the template's cold open and sign-off rules read the segment's number, the segment count,
	// and the goodbye's opening turns
	const prompt = writePrompt(
		template,
		{
			topicName: generatePodcastEpisodeSegmentOptions.topicName,
			topicPrompt: generatePodcastEpisodeSegmentOptions.topicPrompt,
			podcastEpisodeTitle: outline.title,
			outlineBlock: toOutlineBlock(outline, podcastEpisodeFindings),
			findingsBlock: toFindingsBlock(segmentFindings),
			rejectionReason: generatePodcastEpisodeSegmentOptions.rejectionReason ?? NO_REJECTION_REASON,
		},
		{
			hostsBlock: await toHostsBlock(),
			segmentNumber: String(segmentIndex + 1),
			segmentCount: String(outline.segments.length),
			goodbyeOpening: toGoodbyeOpeningSentence(),
		},
	)
	return { prompt, name, registryPrompt }
}

/**
 * Returns the first words of a text, up to the limit, cut at a word boundary.
 */
export function toLimitedWords(text: string, maxWords: number): string {
	const words = text.trim().split(/\s+/)
	return words.length <= maxWords ? text.trim() : words.slice(0, maxWords).join(" ")
}

// the goodbye's opening turns as the segment prompt quotes them, each named by its speaker and without end punctuation
function toGoodbyeOpeningSentence(): string {
	const quotedTurns = GOODBYE_OPENING_TURNS.map(
		(goodbyeOpeningTurn) =>
			`${PODCAST_EPISODE_SPEAKER_NAMES[goodbyeOpeningTurn.speaker]} saying "${toGoodbyeOpeningLine(goodbyeOpeningTurn)}"`,
	)
	return quotedTurns.join(" and ")
}

// the two hosts and how each one talks, as a block for the outline prompt and the segment prompt
async function toHostsBlock(): Promise<string> {
	const { template } = await fetchPromptTemplate("podcast-episode-hosts")
	return writePrompt(template, {})
}

// the Findings that a segment's prompt lists. the segment's own, in the outline's order, each with its planned length
function toSegmentFindings({
	outline,
	segmentIndex,
	podcastEpisodeFindings,
}: GeneratePodcastEpisodeSegmentOptions): (PodcastEpisodeFinding & { minutes: number })[] {
	const outlinedChapters = outline.segments[segmentIndex]?.chapters ?? []
	return outlinedChapters.flatMap((outlinedChapter) => {
		const podcastEpisodeFinding = podcastEpisodeFindings.find(
			(finding) => finding.findingId === outlinedChapter.findingId,
		)
		return podcastEpisodeFinding ? [{ ...podcastEpisodeFinding, minutes: outlinedChapter.minutes }] : []
	})
}

// list each Finding for a prompt under a number from 1. a draft names each Finding by that number
function toFindingsBlock(podcastEpisodeFindings: (PodcastEpisodeFinding & { minutes?: number })[]): string {
	return podcastEpisodeFindings
		.map((podcastEpisodeFinding, i) => {
			// list a planned length only in a segment's prompt
			const plannedWordCount = Math.round((podcastEpisodeFinding.minutes ?? 0) * PLANNED_WORDS_PER_MINUTE)
			const plannedLengthLines = podcastEpisodeFinding.minutes
				? [`planned length: about ${plannedWordCount} words`]
				: []
			return [
				`finding number: ${i + 1}`,
				`title: ${podcastEpisodeFinding.title}`,
				`source: ${podcastEpisodeFinding.sourceHost}`,
				...plannedLengthLines,
				`summary: ${podcastEpisodeFinding.snippet || "none"}`,
				`relevance explanation: ${podcastEpisodeFinding.relevanceExplanation || "none"}`,
				`stored content:\n${toLimitedWords(podcastEpisodeFinding.content, MAX_RESOURCE_WORDS) || "none"}`,
			].join("\n")
		})
		.join("\n\n---\n\n")
}

// list the outline's segments in order, each with its theme and its Findings' titles and planned lengths
function toOutlineBlock(outline: PodcastEpisodeOutline, podcastEpisodeFindings: PodcastEpisodeFinding[]): string {
	return outline.segments
		.map((segment, segmentIndex) => {
			// one line per chapter under its segment's theme
			const chapterLines = segment.chapters.map((chapter) => {
				// name each chapter by its Finding's title
				const findingTitle =
					podcastEpisodeFindings.find((finding) => finding.findingId === chapter.findingId)?.title ?? "untitled"
				return `  - ${findingTitle} (about ${chapter.minutes} minutes)`
			})
			return [`segment ${segmentIndex + 1}: ${segment.theme}`, ...chapterLines].join("\n")
		})
		.join("\n")
}
