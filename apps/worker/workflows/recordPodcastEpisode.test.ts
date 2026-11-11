// the recording workflow in the Temporal test environment: a published podcast episode starts its film as an abandoned
// child on the film queue if films are on, and a failed film never fails the recording
import { afterAll, beforeAll, expect, test } from "bun:test"
import {
	TOPIC_PODCAST_EPISODE_VIDEO_TASK_QUEUE,
	toTopicPodcastEpisodeVideoWorkflowId,
} from "@carlnotes/contracts/topicPodcastEpisodeVideoWork"
import type { TestWorkflowEnvironment } from "@temporalio/testing"
import type * as recordActivities from "./recordPodcastEpisodeActivities"
import type * as renderActivities from "./renderTopicPodcastEpisodeVideoActivities"
import { createWorkflowTestEnvironment, runTestWorkflow } from "./workflowTestFixtures"

// the local test server with time skipping, shared by the tests in this file
let testEnvironment: TestWorkflowEnvironment
beforeAll(async () => {
	testEnvironment = await createWorkflowTestEnvironment()
}, 120_000)
afterAll(async () => {
	await testEnvironment?.teardown()
})

// the recording's queue and workflows file, and the film workflows file, on a test server no other worker polls
const RECORDING_TASK_QUEUE = "episode-recordings"
const RECORDING_WORKFLOWS_PATH = new URL("./recordPodcastEpisode.ts", import.meta.url).pathname
const FILM_WORKFLOWS_PATH = new URL("./renderTopicPodcastEpisodeVideo.ts", import.meta.url).pathname

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
	}
}

// run a recording while the recording worker and a film worker with the given film activities poll
function runRecording(
	podcastEpisodeId: string,
	{ isFilmEnabled, filmActivities }: { isFilmEnabled: boolean; filmActivities: Partial<typeof renderActivities> },
): Promise<unknown> {
	return runTestWorkflow({
		testEnvironment,
		workflowName: "recordPodcastEpisodeWorkflow",
		workflowArgs: [{ scanId: "scan-1", topicId: "topic-1", billedUserId: "owner-1", trigger: "manual" }],
		taskQueue: RECORDING_TASK_QUEUE,
		workers: [
			{
				taskQueue: RECORDING_TASK_QUEUE,
				workflowsPath: RECORDING_WORKFLOWS_PATH,
				activities: toRecordingActivities(podcastEpisodeId, isFilmEnabled),
			},
			{
				taskQueue: TOPIC_PODCAST_EPISODE_VIDEO_TASK_QUEUE,
				workflowsPath: FILM_WORKFLOWS_PATH,
				activities: filmActivities,
			},
		],
		childWorkflowIds: isFilmEnabled ? [toTopicPodcastEpisodeVideoWorkflowId(podcastEpisodeId)] : [],
	})
}

test("a published podcast episode starts its film on the film queue if films are on", async () => {
	// the films the film worker renders
	const renderedPodcastEpisodeIds: string[] = []
	const recordingResult = await runRecording("episode-on", {
		isFilmEnabled: true,
		filmActivities: {
			renderTopicPodcastEpisodeVideoActivity: async ({ podcastEpisodeId }) => {
				renderedPodcastEpisodeIds.push(podcastEpisodeId)
				return { outcome: "rendered", renderSeconds: 1, byteSize: 1 }
			},
		},
	})

	// the recording finished, and its film rendered under the film's own workflow id
	expect(recordingResult).toBeUndefined()
	expect(renderedPodcastEpisodeIds).toEqual(["episode-on"])
	const filmWorkflow = testEnvironment.client.workflow.getHandle(toTopicPodcastEpisodeVideoWorkflowId("episode-on"))
	expect((await filmWorkflow.describe()).taskQueue).toBe(TOPIC_PODCAST_EPISODE_VIDEO_TASK_QUEUE)
}, 60_000)

test("films off starts no film", async () => {
	// a film worker that would record any render
	const renderedPodcastEpisodeIds: string[] = []
	const recordingResult = await runRecording("episode-off", {
		isFilmEnabled: false,
		filmActivities: {
			renderTopicPodcastEpisodeVideoActivity: async ({ podcastEpisodeId }) => {
				renderedPodcastEpisodeIds.push(podcastEpisodeId)
				return { outcome: "rendered", renderSeconds: 1, byteSize: 1 }
			},
		},
	})

	// the recording finished, and no film workflow exists
	expect(recordingResult).toBeUndefined()
	expect(renderedPodcastEpisodeIds).toEqual([])
	const filmWorkflow = testEnvironment.client.workflow.getHandle(toTopicPodcastEpisodeVideoWorkflowId("episode-off"))
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
	const filmWorkflow = testEnvironment.client.workflow.getHandle(
		toTopicPodcastEpisodeVideoWorkflowId("episode-failed-film"),
	)
	expect((await filmWorkflow.describe()).status.name).toBe("FAILED")
}, 60_000)
