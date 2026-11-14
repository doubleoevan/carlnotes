// the set_topic_image tool: a regenerate past the month's regenerations starts no render, a user who may not edit the
// topic changes nothing, a url that returns a page leaves the image unchanged, and a url's image that stays unchecked
// returns the topic's current image
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as dnsPromises from "node:dns/promises"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { toTopicImageUrls } from "@carlnotes/contracts/topicImages"
import * as topicImageRenders from "@carlnotes/pipeline/topicImages/topicImageRenders"
import * as authorization from "../authorization"
import * as topicImageEdits from "../topic/topicImageEdits"
import * as topics from "../topic/topics"
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

test("a url's image that stays unchecked returns the topic's current image and says only the caller sees the new one", async () => {
	// an editor, a url whose image stays unchecked, and the topic's page with its published image
	const publishedImage = toTopicImageUrls("topic-1", "published-hash")
	spyOn(topicImageEdits, "loadTopicImageEditor").mockResolvedValue(EDITOR)
	const setTopicImageFromUrlSpy = spyOn(topicImageEdits, "setTopicImageFromUrl").mockResolvedValue({
		status: "saved",
		image: toTopicImageUrls("topic-1", "unchecked-hash"),
		isImageUnchecked: true,
	})
	spyOn(topics, "loadTopicPage").mockResolvedValue(toTestTopicResponse({ id: "topic-1", image: publishedImage }))

	// the result keeps every field, with the current image in the new one's place, and its text says that only the caller
	// sees the new image
	const uncheckedToolResult = await toSetTopicImageHandler()({
		topic_id: "topic-1",
		image_url: "https://images.example/a",
	})
	expect(uncheckedToolResult.isError).toBeFalsy()
	expect(toResultText(uncheckedToolResult)).toContain("Only you can see the new image until Carl finishes checking it.")
	expect(uncheckedToolResult.structuredContent).toMatchObject({
		status: "saved",
		topicId: "topic-1",
		afterTopicDraft: { name: expect.any(String) },
		image: publishedImage,
	})

	// the result names no url of the unchecked image, whose files only the caller's own session reads
	expect(JSON.stringify(uncheckedToolResult)).not.toContain("unchecked-hash")

	// an image that passed its check is returned as the new image
	const savedImage = toTopicImageUrls("topic-1", "saved-hash")
	setTopicImageFromUrlSpy.mockResolvedValue({ status: "saved", image: savedImage, isImageUnchecked: false })
	const savedToolResult = await toSetTopicImageHandler()({ topic_id: "topic-1", image_url: "https://images.example/a" })
	expect(toResultText(savedToolResult)).toBe("Saved the new image.")
	expect(savedToolResult.structuredContent).toMatchObject({ status: "saved", topicId: "topic-1", image: savedImage })
})
