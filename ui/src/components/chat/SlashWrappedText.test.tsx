// render tests for the slash-wrapped text: a url gains a break opportunity after each slash and reads back unchanged
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SlashWrappedText } from "./SlashWrappedText"

test("a url breaks after each slash and keeps its characters", () => {
	const markup = renderToStaticMarkup(<SlashWrappedText text="see https://a.b/c/d" />)
	expect(markup).toBe("see https:/<wbr/>/<wbr/>a.b/<wbr/>c/<wbr/>d")
})

test("text without a slash renders as written", () => {
	expect(renderToStaticMarkup(<SlashWrappedText text="just words" />)).toBe("just words")
})
