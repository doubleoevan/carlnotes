// the image render activity's house style, with the render row, the image model, and the stores stubbed: a film's
// image keeps the film house style after an image prompt, and a topic's image is drawn from the image prompt alone
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as litellm from "@carlnotes/models/litellm"
import * as topicImageOriginals from "@carlnotes/pipeline/topicImages/renderTopicImageOriginal"
import * as topicImageFiles from "@carlnotes/pipeline/topicImages/topicImageFiles"
import type { TopicImageRenderRow } from "@carlnotes/pipeline/topicImages/topicImageRenders"
import * as topicImageRenders from "@carlnotes/pipeline/topicImages/topicImageRenders"
import * as topicVideoImage from "@carlnotes/pipeline/topicVideo/topicVideoImage"
import * as analytics from "@carlnotes/server/analytics"
import { renderAndStoreTopicImage } from "./renderTopicImageActivities"

// an editor's image prompt, and the scene written from it
const IMAGE_PROMPT = "a foggy morning over a bridge"
const SCENE = "A bridge in fog at first light."

// put every spy back after each test
afterEach(() => {
	mock.restore()
})

// the delete of a render's kept drawn bytes, which every test's store reaches
let deleteDrawnImage: ReturnType<typeof spyOn>

// spy the render row's read, the user's key, the image model, the kept bytes' delete, and the event, and return the
// image model's spy
function spyImageRender(renderRow: Partial<TopicImageRenderRow>): ReturnType<typeof spyOn> {
	// a pending regenerate that the user pays for
	spyOn(topicImageRenders, "loadTopicImageRender").mockResolvedValue({
		id: "render-1",
		topicId: "topic-1",
		userId: "user-1",
		topicOwnerId: "user-1",
		kind: "regenerate",
		status: "pending",
		model: "image-model",
		...renderRow,
	} as TopicImageRenderRow)
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("sk-user")
	spyOn(analytics, "trackEvent").mockImplementation(() => {})
	deleteDrawnImage = spyOn(topicImageOriginals, "deleteDrawnImage").mockResolvedValue(undefined)

	// the image model returns an original at the film's frame size
	return spyOn(topicImageOriginals, "renderTopicImageOriginal").mockResolvedValue({
		jpegBytes: new Uint8Array([1, 2, 3]),
		width: 1280,
		height: 720,
	})
}

test("a film's image drawn from an image prompt is still sent in the film house style", async () => {
	// a regenerate of a film's image, with an image prompt
	const renderOriginal = spyImageRender({ topicVideoId: "film-1" })
	const replaceFilmImage = spyOn(topicVideoImage, "replaceTopicVideoImage").mockResolvedValue("film-image-hash")
	await renderAndStoreTopicImage({ renderId: "render-1", scene: SCENE, imagePrompt: IMAGE_PROMPT })

	// the scene goes with the film house style, at the film's frame
	expect(renderOriginal.mock.calls[0]?.[0]).toMatchObject({
		scene: SCENE,
		isHouseStyle: true,
		format: topicVideoImage.TOPIC_VIDEO_IMAGE_FORMAT,
	})

	// the film's row keeps the image prompt
	expect(replaceFilmImage.mock.calls[0]?.[0]).toMatchObject({
		topicVideoId: "film-1",
		imagePrompt: IMAGE_PROMPT,
	})
})

test("a film's regenerated image is billed at the size it is drawn at, and a topic's at the model's own", async () => {
	// a regenerate of a film's image on the model that draws at 2K
	spyImageRender({ topicVideoId: "film-1", model: "gemini-3.1-flash-image" })
	const replaceFilmImage = spyOn(topicVideoImage, "replaceTopicVideoImage").mockResolvedValue("film-image-hash")
	await renderAndStoreTopicImage({ renderId: "render-1", scene: SCENE })
	expect(replaceFilmImage.mock.calls[0]?.[0].costDollars).toBe(0.101)

	// a regenerate of a topic's image on the same model costs the 1K rate
	spyImageRender({ model: "gemini-3.1-flash-image" })
	spyOn(topicImageFiles, "storeTopicImageFiles").mockResolvedValue("topic-image-hash")
	const replaceTopicImage = spyOn(topicImageRenders, "replaceTopicImage").mockResolvedValue(undefined)
	await renderAndStoreTopicImage({ renderId: "render-1", scene: SCENE })
	expect(replaceTopicImage.mock.calls[0]?.[0].costDollars).toBe(0.067)
})

test("a topic's image drawn from an image prompt is sent without the house style", async () => {
	// a regenerate of a topic's image, with an image prompt
	const renderOriginal = spyImageRender({})
	spyOn(topicImageFiles, "storeTopicImageFiles").mockResolvedValue("topic-image-hash")
	spyOn(topicImageRenders, "replaceTopicImage").mockResolvedValue(undefined)
	await renderAndStoreTopicImage({ renderId: "render-1", scene: SCENE, imagePrompt: IMAGE_PROMPT })

	// the image prompt replaces the house style, and no film format is set
	expect(renderOriginal.mock.calls[0]?.[0]).toMatchObject({ scene: SCENE, isHouseStyle: false })
	expect(renderOriginal.mock.calls[0]?.[0].format).toBeUndefined()
})

// the draw is the paid step, so its bytes are kept under the render's key until the image is current
test("a render keeps its drawn bytes under its own key until the image is stored, then deletes them", async () => {
	// a topic's image whose store fails once
	const renderImage = spyImageRender({})
	const storeFiles = spyOn(topicImageFiles, "storeTopicImageFiles")
		.mockRejectedValueOnce(new Error("the upload timed out"))
		.mockResolvedValue("topic-image-hash")
	spyOn(topicImageRenders, "replaceTopicImage").mockResolvedValue(undefined)

	// the failed attempt asks for the bytes to be kept under the render's key, and deletes nothing
	await expect(renderAndStoreTopicImage({ renderId: "render-1", scene: SCENE })).rejects.toThrow("the upload timed out")
	expect(renderImage.mock.calls[0]?.[0].drawnImageKey).toBe("drawn-images/topic-image-render/render-1")
	expect(deleteDrawnImage).not.toHaveBeenCalled()

	// the next attempt names the same key, stores the image, and lets the kept bytes go
	await renderAndStoreTopicImage({ renderId: "render-1", scene: SCENE })
	expect(renderImage.mock.calls[1]?.[0].drawnImageKey).toBe("drawn-images/topic-image-render/render-1")
	expect(storeFiles).toHaveBeenCalledTimes(2)
	expect(deleteDrawnImage.mock.calls).toEqual([["drawn-images/topic-image-render/render-1"]])
})
