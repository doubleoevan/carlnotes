import { expect, test } from "bun:test"
import { toTopicImageUrls } from "@carlnotes/contracts/topicImages"
import { TopicImage, type TopicImageElements } from "./TopicImage"

// the elements a test tells apart by identity, and a topic's image at the list size
const elements: TopicImageElements = { Box: () => null, Image: () => null, Placeholder: () => null }
const props = { size: "list" as const, name: "Chens", elements }

test("a topic with no image shows the placeholder at the size, in a box with no name", () => {
	const box = TopicImage({ ...props, image: null })
	expect(box.type).toBe(elements.Box)
	expect(box.props.label).toBe("")
	expect(box.props.children.type).toBe(elements.Placeholder)
	expect(box.props.children.props).toEqual({ size: "list" })
})

test("a topic with an image shows the size's files in a named box, with no placeholder", () => {
	const image = toTopicImageUrls("t1", "hash")
	const box = TopicImage({ ...props, image })
	expect(box.props.label).toBe("Image of Chens")
	expect(box.props.children.type).toBe(elements.Image)
	expect(box.props.children.props).toMatchObject({ ...image.list, alt: "Image of Chens" })
})
