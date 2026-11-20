// the recording workflow in the Temporal test environment: a published podcast episode starts its film as an abandoned
// child on the film queue if films are on, a failed film never fails the recording, a recording that the reaper started
// again records from what its first run stored, a scheduled Scan's chapters record on their own queue, the encode runs
// on its own queue, and a script call or a chapter that fails for a few minutes delays the podcast episode
import { afterAll, beforeAll, expect, test } from "bun:test"
import {
	PODCAST_EPISODE_ENCODE_TASK_QUEUE,
	PODCAST_EPISODE_SCHEDULED_CHAPTER_TASK_QUEUE,
	PODCAST_EPISODE_TASK_QUEUE,
} from "@carlnotes/contracts/podcastEpisodeWork"
import {
	TOPIC_VIDEO_TASK_QUEUE,
	TOPIC_VIDEO_WRITE_TASK_QUEUE,
	toTopicVideoWorkflowId,
} from "@carlnotes/contracts/topicVideoWork"
import type { TestWorkflowEnvironment } from "@temporalio/testing"
import type * as recordActivities from "./recordPodcastEpisodeActivities"
import type * as renderActivities from "./renderTopicVideoActivities"
import {
	createWorkflowTestEnvironment,
	runTestWorkflow,
	runWithTestWorkers,
	type WorkflowTestWorker,
} from "./workflowTestFixtures"

// the local test server with time skipping, shared by the tests in this file
let testEnvironment: TestWorkflowEnvironment
beforeAll(async () => {
	testEnvironment = await createWorkflowTestEnvironment()
}, 120_000)
afterAll(async () => {
	await testEnvironment?.teardown()
})

// the recording's workflows file and the film workflows file, on a test server no other worker polls
const RECORDING_WORKFLOWS_PATH = new URL("./recordPodcastEpisode.ts", import.meta.url).pathname
const FILM_WORKFLOWS_PATH = new URL("./renderTopicVideo.ts", import.meta.url).pathname

// a recording's activities that publish one podcast episode with one chapter, and the films setting
function toRecordingActivities(podcastEpisodeId: string, isFilmEnabled: boolean): Partial<typeof recordActivities> {
	return {
		planPodcastEpisode: async () => ({ podcastEpisodeId, plannedFindings: [] }),
		outlinePodcastEpisode: async () => ({ segments: [{}] }) as never,
		writePodcastEpisodeSegment: async () => ({}) as never,
		savePodcastEpisodeScript: async () => 1,
		recordPodcastEpisodeChapter: async () => ({ position: 0, attemptCount: 1 }) as never,
		encodePodcastEpisode: async () => ({}) as never,
		publishPodcastEpisode: async () => undefined as never,
		failPodcastEpisode: async () => undefined,
		drawPodcastEpisodeImageActivity: async () => undefined,
		isTopicPodcastEpisodeVideoEnabled: async () => isFilmEnabled,
		selectNewTopicVideoRenderVersion: async () => (isFilmEnabled ? 4 : false),
	}
}

// the encode queue's Worker, which holds the encode alone and no workflow
function toEncodeWorker(activities: Partial<typeof recordActivities>): WorkflowTestWorker {
	return {
		taskQueue: PODCAST_EPISODE_ENCODE_TASK_QUEUE,
		activities: { encodePodcastEpisode: activities.encodePodcastEpisode },
	}
}

// run a recording while the recording worker, the encode worker, a film worker with the given film activities, and a worker on the queue
// of the film's short writes poll. the film's row write does nothing, and its failure mark is the test's own
function runRecording(
	podcastEpisodeId: string,
	{ isFilmEnabled, filmActivities }: { isFilmEnabled: boolean; filmActivities: Partial<typeof renderActivities> },
): Promise<unknown> {
	return runTestWorkflow({
		testEnvironment,
		workflowName: "recordPodcastEpisodeWorkflow",
		workflowArgs: [{ scanId: "scan-1", topicId: "topic-1", billedUserId: "owner-1", trigger: "manual" }],
		taskQueue: PODCAST_EPISODE_TASK_QUEUE,
		workers: [
			{
				taskQueue: PODCAST_EPISODE_TASK_QUEUE,
				workflowsPath: RECORDING_WORKFLOWS_PATH,
				activities: toRecordingActivities(podcastEpisodeId, isFilmEnabled),
			},
			toEncodeWorker(toRecordingActivities(podcastEpisodeId, isFilmEnabled)),
			{
				taskQueue: TOPIC_VIDEO_TASK_QUEUE,
				workflowsPath: FILM_WORKFLOWS_PATH,
				activities: filmActivities,
			},
			{
				taskQueue: TOPIC_VIDEO_WRITE_TASK_QUEUE,
				activities: { saveTopicPodcastEpisodeVideoRenderingActivity: async () => undefined, ...filmActivities },
			},
		],
		childWorkflowIds: isFilmEnabled ? [toTopicVideoWorkflowId(podcastEpisodeId)] : [],
	})
}

test("a published podcast episode starts its film on the film queue if films are on", async () => {
	// the films the film worker renders
	const renderedPodcastEpisodeIds: string[] = []
	const recordingResult = await runRecording("episode-on", {
		isFilmEnabled: true,
		filmActivities: {
			renderTopicPodcastEpisodeVideoActivity: async ({ podcastEpisodeId, renderVersion }) => {
				expect(renderVersion).toBe(4)
				renderedPodcastEpisodeIds.push(podcastEpisodeId)
				return { outcome: "rendered", renderSeconds: 1, byteSize: 1, generatedChapterImageCount: 0 }
			},
		},
	})

	// the recording finished, and its film rendered under the film's own workflow id
	expect(recordingResult).toBeUndefined()
	expect(renderedPodcastEpisodeIds).toEqual(["episode-on"])
	const filmWorkflow = testEnvironment.client.workflow.getHandle(toTopicVideoWorkflowId("episode-on"))
	expect((await filmWorkflow.describe()).taskQueue).toBe(TOPIC_VIDEO_TASK_QUEUE)
}, 60_000)

test("films off starts no film", async () => {
	// a film worker that would record any render
	const renderedPodcastEpisodeIds: string[] = []
	const recordingResult = await runRecording("episode-off", {
		isFilmEnabled: false,
		filmActivities: {
			renderTopicPodcastEpisodeVideoActivity: async ({ podcastEpisodeId }) => {
				renderedPodcastEpisodeIds.push(podcastEpisodeId)
				return { outcome: "rendered", renderSeconds: 1, byteSize: 1, generatedChapterImageCount: 0 }
			},
		},
	})

	// the recording finished, and no film workflow exists
	expect(recordingResult).toBeUndefined()
	expect(renderedPodcastEpisodeIds).toEqual([])
	const filmWorkflow = testEnvironment.client.workflow.getHandle(toTopicVideoWorkflowId("episode-off"))
	await expect(filmWorkflow.describe()).rejects.toThrow()
}, 60_000)

test("a film that fails leaves the recording finished", async () => {
	// a film that fails both attempts, and its failure mark
	const failureMarks: string[] = []
	const recordingResult = await runRecording("episode-failed-film", {
		isFilmEnabled: true,
		filmActivities: {
			renderTopicPodcastEpisodeVideoActivity: async () => {
				throw new Error("ffmpeg exited with code 1")
			},
			markTopicPodcastEpisodeVideoFailedActivity: async ({ podcastEpisodeId }) => {
				failureMarks.push(podcastEpisodeId)
			},
		},
	})

	// the recording finished, the film was marked failed, and the film workflow failed on its own
	expect(recordingResult).toBeUndefined()
	expect(failureMarks).toEqual(["episode-failed-film"])
	const filmWorkflow = testEnvironment.client.workflow.getHandle(toTopicVideoWorkflowId("episode-failed-film"))
	expect((await filmWorkflow.describe()).status.name).toBe("FAILED")
}, 60_000)

// the reaper starts a recording again from outside any Scan workflow, so no Scan email workflow waits for its outline.
// the restarted run's activities return what the first run stored: an outline with no segment for the saved script,
// the saved script's chapter count, and each stored chapter
test("a recording started again writes no script, records its saved script's chapters, and publishes", async () => {
	// what the restarted run's activities were asked to do
	const activityCalls: string[] = []
	const publishedChapterPositions: number[][] = []
	const restartedActivities: Partial<typeof recordActivities> = {
		...toRecordingActivities("episode-restarted", false),
		outlinePodcastEpisode: async () => ({ title: "A saved title", description: "", segments: [] }),
		writePodcastEpisodeSegment: async () => {
			activityCalls.push("segment")
			return {} as never
		},
		// the saved script has two chapters, and each is returned from its stored audio
		savePodcastEpisodeScript: async (_podcastEpisodeId, segments) => {
			activityCalls.push(`save ${segments.length} segments`)
			return 2
		},
		recordPodcastEpisodeChapter: async ({ position, speechTier }) => {
			activityCalls.push(`chapter ${position} ${speechTier}`)
			return { position, chapterKey: `chapter-${position}`, byteSize: 1, attemptCount: 1 }
		},
		publishPodcastEpisode: async ({ recordedChapterPositions }) => {
			publishedChapterPositions.push(recordedChapterPositions)
		},
	}

	// a manual Scan's recording, started with no Scan workflow and no email workflow behind it
	const recordingResult = await runTestWorkflow({
		testEnvironment,
		workflowName: "recordPodcastEpisodeWorkflow",
		workflowArgs: [{ scanId: "scan-restarted", topicId: "topic-1", billedUserId: "owner-1", trigger: "manual" }],
		taskQueue: PODCAST_EPISODE_TASK_QUEUE,
		workers: [
			{
				taskQueue: PODCAST_EPISODE_TASK_QUEUE,
				workflowsPath: RECORDING_WORKFLOWS_PATH,
				activities: restartedActivities,
			},
			toEncodeWorker(restartedActivities),
		],
	})

	// no segment was written, the save saw none, both chapters recorded on the manual Scan's tier, and both published
	expect(recordingResult).toBeUndefined()
	expect(activityCalls.toSorted()).toEqual(["chapter 0 standard", "chapter 1 standard", "save 0 segments"])
	expect(publishedChapterPositions).toEqual([[0, 1]])
}, 60_000)

// run a recording of two chapters for a trigger, with a Worker on the recording queue and an activities-only Worker on
// the scheduled chapter queue and on the encode queue, and return which queue's Worker ran each activity
async function runRecordingOnBothQueues(trigger: "scheduled" | "manual"): Promise<Record<string, string[]>> {
	// each Worker's activities note the queue they ran on
	const activityQueues: Record<string, string[]> = {}
	const toQueueActivities = (taskQueue: string): Partial<typeof recordActivities> => {
		const noteActivity = (activityName: string): void => {
			activityQueues[activityName] = [...(activityQueues[activityName] ?? []), taskQueue]
		}
		return {
			...toRecordingActivities(`episode-${trigger}`, false),
			planPodcastEpisode: async () => {
				noteActivity("plan")
				return { podcastEpisodeId: `episode-${trigger}`, plannedFindings: [] }
			},
			// the script has two chapters
			outlinePodcastEpisode: async () => {
				noteActivity("outline")
				return { segments: [{}] } as never
			},
			savePodcastEpisodeScript: async () => 2,
			recordPodcastEpisodeChapter: async ({ position }) => {
				noteActivity("chapter")
				return { position, chapterKey: `chapter-${position}`, byteSize: 1, attemptCount: 1 }
			},
			encodePodcastEpisode: async () => {
				noteActivity("encode")
				return {} as never
			},
		}
	}

	// the recording queue's Worker holds the workflow, and the other two queues' Workers hold activities alone
	const recordingResult = await runTestWorkflow({
		testEnvironment,
		workflowName: "recordPodcastEpisodeWorkflow",
		workflowArgs: [{ scanId: `scan-${trigger}`, topicId: "topic-1", billedUserId: "owner-1", trigger }],
		taskQueue: PODCAST_EPISODE_TASK_QUEUE,
		workers: [
			{
				taskQueue: PODCAST_EPISODE_TASK_QUEUE,
				workflowsPath: RECORDING_WORKFLOWS_PATH,
				activities: toQueueActivities(PODCAST_EPISODE_TASK_QUEUE),
			},
			{
				taskQueue: PODCAST_EPISODE_SCHEDULED_CHAPTER_TASK_QUEUE,
				activities: toQueueActivities(PODCAST_EPISODE_SCHEDULED_CHAPTER_TASK_QUEUE),
			},
			toEncodeWorker(toQueueActivities(PODCAST_EPISODE_ENCODE_TASK_QUEUE)),
		],
	})
	expect(recordingResult).toBeUndefined()
	return activityQueues
}

// a chapter that waits hours for speech capacity never holds a recording slot that a script needs, and encodes that
// arrive together wait for a core on their own queue
test("a scheduled Scan's chapters and its encode run on their own queues, and its script on the recording queue", async () => {
	expect(await runRecordingOnBothQueues("scheduled")).toEqual({
		plan: ["episode-recordings"],
		outline: ["episode-recordings"],
		chapter: ["episode-scheduled-chapters", "episode-scheduled-chapters"],
		encode: ["episode-encodes"],
	})
}, 60_000)

test("a manual Scan's chapters record on the recording queue, and its encode runs on the encode queue", async () => {
	const activityQueues = await runRecordingOnBothQueues("manual")
	expect(activityQueues.chapter).toEqual(["episode-recordings", "episode-recordings"])
	expect(activityQueues.encode).toEqual(["episode-encodes"])
}, 60_000)

// the outline's retries wait 30 seconds, a minute, and two minutes, and the chapter's five waits add up to fifteen and
// a half minutes. three quick attempts of the outline and five of the chapter would have failed the podcast episode
test("a model that fails for minutes delays a podcast episode and does not fail it", async () => {
	// an outline that the model rejects three times and a chapter whose speech fails five times
	const attemptCounts = { outline: 0, chapter: 0 }
	const closingCalls: string[] = []
	const rateLimitedActivities: Partial<typeof recordActivities> = {
		...toRecordingActivities("episode-rate-limited", false),
		outlinePodcastEpisode: async () => {
			attemptCounts.outline += 1
			if (attemptCounts.outline <= 3) {
				throw new Error("429 rate limit exceeded")
			}
			return { segments: [{}] } as never
		},
		recordPodcastEpisodeChapter: async () => {
			attemptCounts.chapter += 1
			if (attemptCounts.chapter <= 5) {
				throw new Error("the speech model is overloaded")
			}
			return { position: 0, attemptCount: attemptCounts.chapter } as never
		},
		publishPodcastEpisode: async () => {
			closingCalls.push("published")
			return undefined as never
		},
		failPodcastEpisode: async () => {
			closingCalls.push("failed")
		},
	}

	// a manual Scan's recording, whose chapter is on the standard tier, on a test server of its own, because the clock
	// that this test moves by hand stops moving once another test's workflow has run on the same server
	const workers = [
		{
			taskQueue: PODCAST_EPISODE_TASK_QUEUE,
			workflowsPath: RECORDING_WORKFLOWS_PATH,
			activities: rateLimitedActivities,
		},
		toEncodeWorker(rateLimitedActivities),
	]
	const ownTestEnvironment = await createWorkflowTestEnvironment()
	const recordingResult = await runWithTestWorkers(ownTestEnvironment, workers, async () => {
		const recording = await ownTestEnvironment.client.workflow.start("recordPodcastEpisodeWorkflow", {
			taskQueue: PODCAST_EPISODE_TASK_QUEUE,
			workflowId: `episode-rate-limited-${crypto.randomUUID()}`,
			args: [{ scanId: "scan-rate-limited", topicId: "topic-1", billedUserId: "owner-1", trigger: "manual" }],
		})

		// the test server skips no time while an activity waits for its retry, so move its clock a minute at a time
		// until the recording closes
		while (closingCalls.length === 0) {
			await ownTestEnvironment.sleep("1 minute")
		}
		return recording.result()
	}).finally(() => ownTestEnvironment.teardown())

	// the outline was written on its fourth attempt, the chapter recorded on its sixth, and the podcast episode published
	expect(recordingResult).toBeUndefined()
	expect(attemptCounts).toEqual({ outline: 4, chapter: 6 })
	expect(closingCalls).toEqual(["published"])
}, 60_000)
