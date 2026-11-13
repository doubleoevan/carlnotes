// the set_topic_image tool: a regenerate past the month's regenerations starts no render, a user who may not edit the
// topic changes nothing, and a url that returns a page leaves the image unchanged
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as dnsPromises from "node:dns/promises"
import * as topicImageRenders from "@carlnotes/pipeline/topicImages/topicImageRenders"
import * as authorization from "../authorization"
import * as topicImageEdits from "../topic/topicImageEdits"
import { type RegisteredToolHandler, toRegisteredTools, toResultText, USER } from "./toolTestFixtures"

// resolve the .example hosts to a fixed public address. every other host keeps the real resolver
mock.module("node:dns/promises", () => ({
	...dnsPromises,
	lookup: (host: string, options: { all: true }) =>
		host.endsWith(".example")
			? Promise.resolve([{ address: "93.184.216.34", family: 4 }])
			: dnsPromises.lookup(host, options),
}))

// the topic the user edits, and the network each test replaces
const EDITOR = { userId: "user-1", topic: { id: "topic-1", ownerId: "user-1" } }
const originalFetch = globalThis.fetch

// the render start and the image replace, which no test here reaches
let startRenderSpy: ReturnType<typeof spyOn<typeof topicImageRenders, "startTopicImageRender">>
let replaceImageSpy: ReturnType<typeof spyOn<typeof topicImageRenders, "replaceTopicImage">>

// stub both before each test, so a test can check neither ran
beforeEach(() => {
	startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")
	replaceImageSpy = spyOn(topicImageRenders, "replaceTopicImage").mockResolvedValue(undefined as never)
})

// put the spies and the network back after each test
afterEach(() => {
	mock.restore()
	globalThis.fetch = originalFetch
})

// the set_topic_image handler the user gets
function toSetTopicImageHandler(): RegisteredToolHandler {
	const handler = toRegisteredTools(USER).get("set_topic_image")?.handler
	if (!handler) {
		throw new Error("set_topic_image is not registered")
	}
	return handler
}

test("a regenerate past the month's regenerations starts no render", async () => {
	spyOn(topicImageEdits, "loadTopicImageEditor").mockResolvedValue(EDITOR)
	spyOn(authorization, "isAllowed").mockResolvedValue(false)
	const toolResult = await toSetTopicImageHandler()({ topic_id: "topic-1" })
	expect(toolResult.isError).toBe(true)
	expect(toResultText(toolResult)).toContain("This month's image regenerations are used")
	expect(startRenderSpy).not.toHaveBeenCalled()
})

test("a user who may not edit the topic changes nothing", async () => {
	spyOn(topicImageEdits, "loadTopicImageEditor").mockResolvedValue(null)
	const toolResult = await toSetTopicImageHandler()({ topic_id: "topic-1", image_prompt: "a red espresso machine" })
	expect(toResultText(toolResult)).toBe("You may not change this topic's image.")
	expect(startRenderSpy).not.toHaveBeenCalled()
})

test("a url that returns a page leaves the image unchanged", async () => {
	// every request returns a page
	spyOn(topicImageEdits, "loadTopicImageEditor").mockResolvedValue(EDITOR)
	globalThis.fetch = (async () =>
		new Response("<html></html>", { headers: { "content-type": "text/html" } })) as unknown as typeof fetch

	// the url is rejected before any image is stored
	const toolResult = await toSetTopicImageHandler()({ topic_id: "topic-1", image_url: "https://images.example/page" })
	expect(toolResult.isError).toBe(true)
	expect(toResultText(toolResult)).toContain("That url is not a supported image")
	expect(replaceImageSpy).not.toHaveBeenCalled()
})
