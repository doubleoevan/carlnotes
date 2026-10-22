// multi combobox tests: a labeled trigger takes the id that its field label names, and its own text describes it
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { MultiCombobox } from "./MultiCombobox"

// the trigger's id ties it to a field label, and the placeholder or selected count describes it
test("a labeled trigger takes its id and is described by its text", () => {
	const html = renderToStaticMarkup(
		<MultiCombobox id="team-topics" options={[]} values={[]} onUpdateValues={() => {}} placeholder="pick topics…" />,
	)
	const describedById = html.match(/aria-describedby="([^"]+)"/)?.[1]
	expect(html).toContain('id="team-topics"')
	expect(describedById).toBeDefined()
	expect(html).toContain(`<span id="${describedById}"`)
	expect(html).toContain("pick topics…")
})

// a trigger with no field label is named by its own text, so it has no description
test("an unlabeled trigger has no description", () => {
	const html = renderToStaticMarkup(<MultiCombobox options={[]} values={[]} onUpdateValues={() => {}} />)
	expect(html).not.toContain("aria-describedby")
})
