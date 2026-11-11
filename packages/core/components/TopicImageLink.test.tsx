import { expect, test } from "bun:test"
import { TopicImageLink, type TopicImageLinkElements } from "./TopicImageLink"

// the elements a test tells apart by identity, and a topic's thumbnail that opens the topic's page
const elements: TopicImageLinkElements = { TopicImage: () => null, Link: () => null }
const props = { image: null, size: "thumbnail" as const, name: "Chens", path: "/topics/t1/chens", elements }

test("an image on another page is a link to its page, hidden from a screen reader unless it has a label", () => {
	const linkedImage = TopicImageLink({ ...props, isCurrentPage: false })
	expect(linkedImage.type).toBe(elements.Link)
	expect(linkedImage.props).toMatchObject({ path: "/topics/t1/chens", label: null })
	expect(linkedImage.props.children.type).toBe(elements.TopicImage)

	// the only link to the page has its name
	const labeledImage = TopicImageLink({ ...props, label: "Open Chens", isCurrentPage: false })
	expect(labeledImage.props.label).toBe("Open Chens")
})

test("the open page's own image is a plain image in the link's place", () => {
	const ownImage = TopicImageLink({ ...props, className: "w-30", linkClassName: "shrink-0", isCurrentPage: true })
	expect(ownImage.type).toBe(elements.TopicImage)
	expect(ownImage.props).toMatchObject({ name: "Chens", className: "w-30 shrink-0" })
})
