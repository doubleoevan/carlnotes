import { FULL_PODCAST_EPISODE_MINUTES } from "@carlnotes/contracts/podcastEpisodes"
import { buildChapterPictureVideoPrompt } from "@carlnotes/models/chapterPictureVideo"
import { toUntrustedFences } from "@carlnotes/models/prompts/untrustedFenceTestFixtures"
import { buildContextPrompt } from "@carlnotes/pipeline/attach"
import { buildAgreementPrompt } from "@carlnotes/pipeline/chat/agreement"
import { buildDashboardParagraphPrompt } from "@carlnotes/pipeline/dashboardParagraph"
import { buildSearchPrompt } from "@carlnotes/pipeline/ingest/search"
import { buildTopicMemorySearchPrompt } from "@carlnotes/pipeline/ingest/selectTopicMemorySearchQuery"
import { buildPersonalSourcesContextPrompt } from "@carlnotes/pipeline/personalSources/contextPrompt"
import { buildOutlinePrompt, buildSegmentPrompt } from "@carlnotes/pipeline/podcast/generatePodcastEpisodeScript"
import { buildScorePrompt } from "@carlnotes/pipeline/review/score"
import { buildScanReportPrompt } from "@carlnotes/pipeline/review/summarize"
import { toTopicImagePrompt } from "@carlnotes/pipeline/topicImages/writeTopicImageScene"
import {
	buildTopicMemoryClaimCheckPrompt,
	buildTopicMemorySplitPrompt,
} from "@carlnotes/pipeline/topicMemoryClaimReview"
import { buildTopicMemoryDraftPrompt } from "@carlnotes/pipeline/topicMemoryDrafts"
import { buildTopicMemoryReplacementPrompt } from "@carlnotes/pipeline/topicMemoryReplacements"
import { buildTopicPostSummaryPrompt } from "@carlnotes/pipeline/topicPosts/summarizeTopicPost"
import { buildTopicPostDiscussionPrompt } from "@carlnotes/pipeline/topicPosts/topicPostDiscussionScript"
import { TOPIC_VIDEO_IMAGE_FORMAT } from "@carlnotes/pipeline/topicVideo/topicVideoImage"
import { buildUpdatesRecapPrompt } from "@carlnotes/pipeline/updatesRecap"

// write each extracted prompt with sample inputs and report whether the registry served them
export async function writeSamplePrompts(): Promise<[string, boolean][]> {
	// the single-purpose prompts
	const scoreResult = await buildScorePrompt("sample content", "sample topic context", true)
	const topicMemoryResult = await buildTopicMemoryDraftPrompt({
		findings: [
			{ title: "Sample finding", snippet: "Sample evidence", description: "", relevanceScore: 0.9, rating: null },
		],
		neighbors: [],
		scanStartedAt: new Date(),
	})
	const sampleTopicMemory = { text: "The cafe opened and won an award.", factDate: null, person: null }
	const topicMemoryCheckResult = await buildTopicMemoryClaimCheckPrompt([sampleTopicMemory])
	const topicMemorySplitResult = await buildTopicMemorySplitPrompt({
		claim: sampleTopicMemory,
		findings: [{ id: "opening", title: "The cafe opened", snippet: null, description: "The cafe opened." }],
	})
	const topicMemoryReplacementResult = await buildTopicMemoryReplacementPrompt([
		{
			claimType: "runtime",
			earlier: { text: "The festival cut ran 91 minutes.", factDate: "2026-11-01", observedDay: "2026-11-03" },
			newer: {
				text: "The festival cut's corrected runtime is 92 minutes.",
				factDate: "2026-11-01",
				observedDay: "2026-11-04",
			},
		},
	])
	const searchResult = await buildSearchPrompt("sample topic context", "sample topic")
	const searchSelection = await buildTopicMemorySearchPrompt(
		"Coffee",
		["cafe opening"],
		[{ claim: "The cafe opened.", rating: "up", note: "Follow this cafe." }],
	)
	const contextResult = await buildContextPrompt("sample document text")
	const personalSourcesContextResult = await buildPersonalSourcesContextPrompt({
		topic: "Coffee",
		entries: "Synthetic personal sources text",
		hasIncompleteCoverage: false,
	})
	const agreementResult = await buildAgreementPrompt("sounds good", "frequency: daily")
	const updatesRecapResult = await buildUpdatesRecapPrompt({
		topicNames: ["Coffee"],
		findingTitles: ["Sample"],
	})
	const dashboardParagraphResult = await buildDashboardParagraphPrompt({
		summary: { dashboardKind: "topicDashboard", topicCount: 1, findingCount: 2, topicPostCount: 0, viewerCount: 3 },
		series: null,
	})
	const topicPostSummaryResult = await buildTopicPostSummaryPrompt({
		title: "Sample post",
		html: "<p>Sample post text.</p>",
	})
	const topicPostDiscussionResult = await buildTopicPostDiscussionPrompt({
		title: "Sample post",
		html: "<p>Sample post text.</p>",
		authorUsername: "sample-author",
		comments: [{ username: "sample-reader", body: "A sample comment." }],
		hint: "a sample note",
	})

	// the report prompt renders over a minimal sample scan
	const sampleFinding = {
		title: "Sample",
		url: "https://a.test",
		relevanceScore: 0.9,
		relevanceExplanation: "note",
		isNew: true,
	}
	const reportResult = await buildScanReportPrompt({
		topicName: "sample topic",
		topicContext: "sample topic context",
		date: "January 1, 2026",
		// a single kept finding with zeroed drop totals
		reviewOutcome: {
			keptFindings: [sampleFinding],
			filteredCounts: {
				"duplicate content": 0,
				"near-duplicate": 0,
				"below relevance threshold": 0,
				"unsafe content": 0,
				"no text to score": 0,
			},
			deferredCount: 0,
			failedCount: 0,
		},
		// one healthy source and an untouched budget
		scannedSources: [{ sourceKind: "rss", status: "ok" }],
		budget: {
			spentDollars: 0,
			reservedDollars: 0,
			limitDollars: 0.5,
			stageCosts: { ingestion: 0, embedding: 0, fetch: 0, scoringCheap: 0, scoringPremium: 0 },
			maxScoredResources: 25,
			fetchCounts: { reusedCount: 0, revalidatedCount: 0, fetchedCount: 0 },
			modelCallWaitDeadlineAt: null,
		},
	})

	// the podcast episode's outline prompt and segment prompt, over one sample finding in a one-segment outline
	const samplePodcastEpisodeFinding = {
		findingId: "finding-1",
		title: "Sample",
		sourceHost: "a.test",
		snippet: "sample summary",
		relevanceExplanation: "note",
		content: "sample content",
	}
	const scriptInput = {
		topicName: "sample topic",
		topicPrompt: "sample topic prompt",
		podcastEpisodeFindings: [samplePodcastEpisodeFinding],
		maxMinutes: FULL_PODCAST_EPISODE_MINUTES,
	}
	const outlineResult = await buildOutlinePrompt(scriptInput)
	const sampleOutline = {
		title: "Sample episode",
		description: "A sample.",
		segments: [{ theme: "sample", chapters: [{ findingId: "finding-1", minutes: 2 }] }],
	}
	const segmentResult = await buildSegmentPrompt({ ...scriptInput, outline: sampleOutline, segmentIndex: 0 })

	// report whether the registry actually served this run's prompts, or the worker ran on the bundled Markdown alone
	const servedFromRegistry = [
		scoreResult,
		topicMemoryResult,
		topicMemoryCheckResult,
		topicMemorySplitResult,
		topicMemoryReplacementResult,
		searchResult,
		searchSelection,
		contextResult,
		agreementResult,
		updatesRecapResult,
		dashboardParagraphResult,
		topicPostSummaryResult,
		topicPostDiscussionResult,
		reportResult,
		outlineResult,
		segmentResult,
	].some((result) => result.registryPrompt && !result.registryPrompt.isFallback)
	console.log(`registry serving  : ${servedFromRegistry ? "prompts served from Langfuse" : "bundled markdown only"}`)

	// each prompt renders to a non-empty string
	const builtPrompts: [string, string][] = [
		["score prompt", scoreResult.prompt],
		["topic memory draft prompt", topicMemoryResult.prompt],
		["topic memory claim check prompt", topicMemoryCheckResult.prompt],
		["topic memory split prompt", topicMemorySplitResult.prompt],
		["topic memory replacement prompt", topicMemoryReplacementResult.prompt],
		["search prompt", searchResult.prompt],
		["topic memory search selection", searchSelection.prompt],
		["attachment context prompt", contextResult.prompt],
		["Personal sources context prompt", personalSourcesContextResult.prompt],
		["agreement check prompt", agreementResult.prompt],
		["updates recap prompt", updatesRecapResult.prompt],
		["topic post summary prompt", topicPostSummaryResult.prompt],
		["topic post discussion prompt", topicPostDiscussionResult.prompt],
		["scan report prompt", reportResult.prompt],
		["episode outline prompt", outlineResult.prompt],
		["episode segment prompt", segmentResult.prompt],
	]
	const builtPromptChecks = builtPrompts.flatMap(([label, prompt]): [string, boolean][] => [
		[`${label} renders`, prompt.length > 0],
		[`${label} fences its untrusted inputs`, toUntrustedFences(prompt).length > 0],
		// the fence closes above the final line, so a prompt ending on a closing tag ends on a value
		[`${label} restates the task last`, !prompt.trimEnd().endsWith(">")],
	])

	// the film image prompt is a scene with the film house style after it, which takes no untrusted input
	const sampleScene = "a sample scene"
	const topicVideoImagePrompt = await toTopicImagePrompt(sampleScene, TOPIC_VIDEO_IMAGE_FORMAT.stylePromptName)
	const animationPrompt = await buildChapterPictureVideoPrompt("foliage", "100, 200, 350, 400")
	// the dashboard paragraph prompt takes counts and country names alone, so it has nothing untrusted to fence
	const dashboardParagraphPrompt = dashboardParagraphResult.prompt
	return [
		...builtPromptChecks,
		["dashboard paragraph prompt renders", dashboardParagraphPrompt.length > 0],
		["dashboard paragraph prompt restates the task last", !dashboardParagraphPrompt.trimEnd().endsWith(">")],
		["film image prompt renders", topicVideoImagePrompt.trim().length > sampleScene.length],
		[
			"film animation prompt renders",
			animationPrompt.includes("foliage") && animationPrompt.includes("100, 200, 350, 400"),
		],
	]
}
