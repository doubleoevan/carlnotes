// topic image editor tests: the key an editor mounts under changes with the month's regeneration count, the image's
// origin, and whether the image is unchecked
import { expect, test } from "bun:test"
import { toTopicImageEditorKey } from "./topicImageEditor"

test("an editor mounts again once its image is unchecked, and once the image is published", () => {
	const uploadedImage = { imageRegenerationQuota: { used: 3 }, imageOrigin: "uploaded" }
	const publishedKey = toTopicImageEditorKey(uploadedImage)

	// an unchecked image of the same origin and count mounts under its own key
	expect(toTopicImageEditorKey({ ...uploadedImage, isImageUnchecked: true })).not.toBe(publishedKey)
	expect(toTopicImageEditorKey({ ...uploadedImage, isImageUnchecked: false })).toBe(publishedKey)

	// the count and the origin still change the key
	expect(toTopicImageEditorKey({ ...uploadedImage, imageRegenerationQuota: { used: 4 } })).not.toBe(publishedKey)
	expect(toTopicImageEditorKey({ ...uploadedImage, imageOrigin: "generated" })).not.toBe(publishedKey)
})
