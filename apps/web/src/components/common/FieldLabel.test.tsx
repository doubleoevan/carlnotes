// field label tests: the label names the field whose id it is given, and a group heading is not a label
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { FieldLabel } from "./FieldLabel"

// the label is a label element tied to the field's id, with the asterisk on a required field hidden from its name
test("the field label is a label tied to its field", () => {
	const html = renderToStaticMarkup(
		<FieldLabel htmlFor="topic-title" isRequired>
			Title
		</FieldLabel>,
	)
	expect(html).toStartWith('<label for="topic-title"')
	expect(html).toContain("Title")
	expect(html).toContain('<span aria-hidden="true" class="text-destructive"> *</span>')
})

// a heading over a group of fields has no htmlFor, so it is a div that names no control
test("a field label with no htmlFor is a div", () => {
	const html = renderToStaticMarkup(<FieldLabel>Tags</FieldLabel>)
	expect(html).toStartWith("<div")
	expect(html).not.toContain("<label")
	expect(html).toContain("Tags")
})
