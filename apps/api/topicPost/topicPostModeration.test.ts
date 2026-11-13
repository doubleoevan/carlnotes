// tests for a Topic Post's moderation texts
import { expect, test } from "bun:test"
import { toTopicPostModerationTexts } from "./topicPostModeration"

test("a body's moderation texts are each paragraph's text and each image's alt text, decoded, after its paragraph", () => {
	const html =
		'<h2>Beans</h2><p>Light <b>roast</b></p><p><img src="/a.webp" alt="A &quot;latte&quot;" /></p><ul><li>one</li></ul>'
	expect(toTopicPostModerationTexts(html)).toEqual(["Beans", "Light roast", 'A "latte"', "one"])
})

test("an image with no alt text and an empty paragraph add no text", () => {
	expect(toTopicPostModerationTexts('<p><img src="/a.webp" alt="" /></p><p></p><p>word</p>')).toEqual(["word"])
})
