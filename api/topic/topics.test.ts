// topic tests for the api

import { afterEach, expect, test } from "bun:test"
import { appUrl } from "@shared/appUrl"
import type { TopicScan } from "@shared/contracts"
import { isTakingDailySlot, toLastSucceededTopicScan } from "./helpers"
import { notifyIndexNowOfTopicChange } from "./topics"

// a scan history row, varied only by the status and id each test needs
function scanRow(id: string, status: TopicScan["status"]): TopicScan {
	return {
		id,
		status,
		startedAt: "2026-07-24T12:00:00.000Z",
		finishedAt: "2026-07-24T12:01:00.000Z",
		stoppedAt: null,
		// the counts, cost, and failure reason the page reads
		foundCount: 0,
		keptCount: 0,
		filteredCount: 0,
		costDollars: null,
		error: null,
		podcastEpisode: null,
	}
}

// scheduling counts a failed scan as the window spent, but the page's baseline stays the last succeeded scan
test("toLastSucceededScan skips a newer failed scan", () => {
	const history = [scanRow("newest-failed", "failed"), scanRow("succeeded", "succeeded"), scanRow("older", "succeeded")]
	expect(toLastSucceededTopicScan(history)?.id).toBe("succeeded")
})

// a history with nothing succeeded yet has no baseline to report
test("toLastSucceededScan is undefined when no scan has succeeded", () => {
	expect(toLastSucceededTopicScan([scanRow("failed", "failed"), scanRow("running", "running")])).toBeUndefined()
})

// only a move to a daily frequency takes one of the plan's daily slots
test("isTakingDailySlot fires only on a move to a daily frequency", () => {
	// a new topic has no current frequency, so asking for a daily frequency takes a slot
	expect(isTakingDailySlot("daily")).toBe(true)
	expect(isTakingDailySlot("weekdays")).toBe(true)
	expect(isTakingDailySlot("weekly")).toBe(false)

	// moving a weekly topic onto either daily or weekdays frequency takes a slot
	expect(isTakingDailySlot("daily", "weekly")).toBe(true)
	expect(isTakingDailySlot("weekdays", "weekly")).toBe(true)
})

// a topic already on a daily frequency keeps the slot it holds, however many slots its owner has.
test("isTakingDailySlot never fires for a topic already on a daily frequency", () => {
	// re-saving the same frequency takes nothing, and so does moving between the two daily frequencies
	expect(isTakingDailySlot("daily", "daily")).toBe(false)
	expect(isTakingDailySlot("weekdays", "weekdays")).toBe(false)
	expect(isTakingDailySlot("daily", "weekdays")).toBe(false)
	expect(isTakingDailySlot("weekdays", "daily")).toBe(false)

	// giving a slot up takes nothing either
	expect(isTakingDailySlot("weekly", "daily")).toBe(false)
})

// the real fetch and key to put back after every test, and the url list of each post the recorder keeps
const realFetch = globalThis.fetch
const realIndexNowKey = Bun.env.INDEXNOW_KEY
const recordedUrlLists: unknown[] = []

// put the key and fetch back after every test
afterEach(() => {
	// restore the real fetch, and clear the recorded url lists
	globalThis.fetch = realFetch
	recordedUrlLists.length = 0

	// restore the real key, or remove the key if there was none
	if (realIndexNowKey === undefined) {
		delete Bun.env.INDEXNOW_KEY
	} else {
		Bun.env.INDEXNOW_KEY = realIndexNowKey
	}
})

// report a topic save with a key and a fetch recorder, then wait for the post to go out
async function notifyTopicSave(topicChange: Parameters<typeof notifyIndexNowOfTopicChange>[0]): Promise<void> {
	// a key, and a fetch that keeps each post's url list
	Bun.env.INDEXNOW_KEY = "k3y"
	globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
		recordedUrlLists.push(JSON.parse(String(init?.body)).urlList)
		return new Response("", { status: 200 })
	}) as typeof fetch

	// report the save, and let the post it starts without awaiting settle
	notifyIndexNowOfTopicChange(topicChange)
	await Bun.sleep(0)
}

// a rename moves a public topic's page, so IndexNow gets the new url and the old one in one post
test("notifyIndexNowOfTopicChange sends the new and old urls when a public topic is renamed", async () => {
	await notifyTopicSave({
		savedTopic: { id: "t1", name: "Coding Agents", visibility: "public" },
		previousTopic: { name: "AI Agents", visibility: "public" },
	})
	expect(recordedUrlLists).toEqual([[`${appUrl()}/topics/t1/coding-agents`, `${appUrl()}/topics/t1/ai-agents`]])
})

// a private topic had no indexed page, so turning it public sends only the new url
test("notifyIndexNowOfTopicChange sends only the new url when a private topic turns public", async () => {
	await notifyTopicSave({
		savedTopic: { id: "t1", name: "AI Agents", visibility: "public" },
		previousTopic: { name: "AI Agents", visibility: "private" },
	})
	expect(recordedUrlLists).toEqual([[`${appUrl()}/topics/t1/ai-agents`]])
})

// a public topic saved under the same name keeps its url, so nothing is sent
test("notifyIndexNowOfTopicChange sends nothing when a public topic keeps its name", async () => {
	await notifyTopicSave({
		savedTopic: { id: "t1", name: "AI Agents", visibility: "public" },
		previousTopic: { name: "AI Agents", visibility: "public" },
	})
	expect(recordedUrlLists).toHaveLength(0)
})

// only a public topic's page is indexed, so a topic that stays private or invite sends nothing
test("notifyIndexNowOfTopicChange sends nothing for a private or invite topic", async () => {
	// a new invite topic, and a private topic renamed
	await notifyTopicSave({ savedTopic: { id: "t2", name: "AI Agents", visibility: "invite" }, previousTopic: null })
	await notifyTopicSave({
		savedTopic: { id: "t1", name: "Coding Agents", visibility: "private" },
		previousTopic: { name: "AI Agents", visibility: "private" },
	})

	expect(recordedUrlLists).toHaveLength(0)
})

// a public topic made private leaves the index, so its old url is sent
test("notifyIndexNowOfTopicChange sends the old url when a public topic turns private", async () => {
	await notifyTopicSave({
		savedTopic: { id: "t1", name: "Coding Agents", visibility: "private" },
		previousTopic: { name: "AI Agents", visibility: "public" },
	})

	expect(recordedUrlLists).toEqual([[`${appUrl()}/topics/t1/ai-agents`]])
})
