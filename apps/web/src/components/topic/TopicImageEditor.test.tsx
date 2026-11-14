// the editor's image block and its unchecked image's line: the line shows under an upload shown to the editor alone,
// from the page's flag and after an upload that is unchecked, and goes after an upload that is published and once a
// regenerate starts. an unchecked upload shows at its urls marked as an unchecked image's, and a published one at its
// plain urls
import { afterEach, expect, test } from "bun:test"
import { toTopicImageUrls, toTopicPodcastEpisodeVideoPosterUrl } from "@carlnotes/contracts/topicImages"
import { toUncheckedImagePath } from "@carlnotes/contracts/uncheckedImages"
import {
	type EditableImage,
	TopicImageEditor,
	type TopicImageEditorElements,
} from "@carlnotes/core/components/TopicImageEditor"
import { UNCHECKED_IMAGE_TEXT } from "@carlnotes/core/lib/uncheckedImageCopy"
import { act } from "react"
import { type HookTestHarness, renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// the plainest elements: the image is its upload button, and each line is a paragraph
const ELEMENTS: TopicImageEditorElements = {
	Layout: ({ image, children }) => (
		<div>
			{image}
			{children}
		</div>
	),
	PromptRow: ({ children }) => <div>{children}</div>,
	Line: ({ children }) => <p>{children}</p>,
	Image: ({ image, uploadLabel, onUpload }) => (
		<button type="button" data-image-url={image?.page.url} onClick={onUpload}>
			{uploadLabel}
		</button>
	),
	PromptInput: () => null,
	RegenerateButton: ({ label, onPress }) => (
		<button type="button" onClick={onPress}>
			{label}
		</button>
	),
}

// a topic with a generated image and regenerations left, as its editor's image block reads it
const TOPIC: EditableImage = {
	kind: "topic",
	id: "topic-1",
	name: "Home espresso",
	image: toTopicImageUrls("topic-1", "published-hash"),
	imageOrigin: "generated",
	imagePrompt: null,
	imageRegenerationQuota: { used: 3, limit: 15 },
}

// the api's own fetch, put back after each test, and the open harnesses, closed after each test
const realFetch = globalThis.fetch
const openHarnesses: HookTestHarness<null>[] = []
afterEach(async () => {
	for (const harness of openHarnesses.splice(0)) {
		await harness.close()
	}
	globalThis.fetch = realFetch
})

// stub fetch to return the next response each api call's path was given, and to fail a call no test expects
function stubApiResponses(responseBodiesByPath: Record<string, unknown[]>): void {
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const path = new URL(String(input), "http://localhost").pathname
		const responseBody = responseBodiesByPath[path]?.shift()
		return responseBody === undefined
			? Response.json({ error: "unexpected" }, { status: 500 })
			: Response.json(responseBody)
	}) as unknown as typeof fetch
}

// mount the image block over an image, with a picker that returns a png
async function renderEditor(editableImage: EditableImage): Promise<HookTestHarness<null>> {
	const harness = await renderTestHook(
		() => null,
		() => (
			<TopicImageEditor
				editableImage={editableImage}
				elements={ELEMENTS}
				pickImage={async () => ({ body: new FormData(), size: 1000, type: "image/png" })}
			/>
		),
	)
	openHarnesses.push(harness)
	return harness
}

// press the block's button of the given label, and whether the unchecked image's line shows
async function pressButton({ container }: HookTestHarness<null>, label: string): Promise<void> {
	const button = [...container.querySelectorAll("button")].find((element) => element.textContent === label)
	await act(async () => button?.click())
}
const isUncheckedLineShown = ({ container }: HookTestHarness<null>): boolean =>
	Boolean(container.textContent?.includes(UNCHECKED_IMAGE_TEXT))

test("the block opens with the unchecked image's line if the page says its image is unchecked", async () => {
	expect(isUncheckedLineShown(await renderEditor({ ...TOPIC, isImageUnchecked: true }))).toBe(true)
})

test("the block opens without the unchecked image's line over a published image", async () => {
	expect(isUncheckedLineShown(await renderEditor(TOPIC))).toBe(false)
})

test("an upload that is unchecked shows the line, and a later upload that is published takes it away", async () => {
	// the first upload is unchecked, and the second passed its check
	const uncheckedImage = toTopicImageUrls("topic-1", "unchecked-hash")
	const publishedImage = toTopicImageUrls("topic-1", "second-hash")
	stubApiResponses({
		"/api/topics/topic-1/image": [{ image: uncheckedImage, isImageUnchecked: true }, { image: publishedImage }],
	})
	const harness = await renderEditor(TOPIC)

	// the unchecked upload shows at once with its line, at its url marked as an unchecked image's
	await pressButton(harness, "Upload an image")
	await waitForHook(() => isUncheckedLineShown(harness))
	expect(harness.container.querySelector("[data-image-url]")?.getAttribute("data-image-url")).toBe(
		toUncheckedImagePath(uncheckedImage.page.url),
	)

	// the published upload shows with no line, at its plain url
	await pressButton(harness, "Upload an image")
	await waitForHook(() => !isUncheckedLineShown(harness))
	expect(harness.container.querySelector("[data-image-url]")?.getAttribute("data-image-url")).toBe(
		publishedImage.page.url,
	)
})

test("a film's unchecked upload shows the line under the film's poster", async () => {
	// the film's upload returns its poster and that it is unchecked
	const posterUrl = toTopicPodcastEpisodeVideoPosterUrl("episode-1", "unchecked-hash")
	stubApiResponses({ "/api/episodes/episode-1/video/image": [{ posterUrl, isImageUnchecked: true }] })
	const harness = await renderEditor({ ...TOPIC, kind: "topicPodcastEpisodeVideo", id: "episode-1" })
	await pressButton(harness, "Upload an image")
	await waitForHook(() => isUncheckedLineShown(harness))
	expect(harness.container.querySelector("[data-image-url]")?.getAttribute("data-image-url")).toBe(
		toUncheckedImagePath(posterUrl),
	)
})

test("a regenerate that starts takes the unchecked image's line away", async () => {
	stubApiResponses({ "/api/topics/topic-1/image/regenerate": [{ renderId: "render-1" }] })
	const harness = await renderEditor({ ...TOPIC, isImageUnchecked: true })
	await pressButton(harness, "Regenerate")
	await waitForHook(() => !isUncheckedLineShown(harness))
	expect(harness.container.textContent).toContain("Dreaming, takes about a minute...")
})
