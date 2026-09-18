// the dialog primitive has to render where there is no DOM, since the ui tests render components to markup
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"

// the content reads the focused element to give focus back on close, which a render with no document has none of
test("a dialog renders to markup without a document", () => {
	const html = renderToStaticMarkup(
		<Dialog open>
			<DialogContent>
				<DialogTitle>A title</DialogTitle>
			</DialogContent>
		</Dialog>,
	)
	expect(typeof html).toBe("string")
})
