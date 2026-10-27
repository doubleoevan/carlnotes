import { expect, test } from "bun:test"
import { RuleType } from "markdown-to-jsx/markdown"
import { isAllowedNoteUrl, type SafeNoteMarkdown, toSafeNoteMarkdown, toSafeNoteNodes } from "./safeNoteMarkdown"

const URL = "https://kept.test/post"
const ALLOWED = new Set([URL, "javascript:alert(1)", "mailto:person@test.com"])

test("only exact stored HTTP(S) destinations pass the final link guard", () => {
	expect(isAllowedNoteUrl(URL, ALLOWED)).toBe(true)
	for (const destination of [
		undefined,
		"javascript:alert(1)",
		"mailto:person@test.com",
		`${URL}/`,
		`${URL}?x`,
		"//kept.test/post",
	]) {
		expect(isAllowedNoteUrl(destination, ALLOWED)).toBe(false)
	}
	expect(isAllowedNoteUrl(URL)).toBe(false)
})

test("inline, reference and automatic links share one allowlist", () => {
	const tree = toSafeNoteMarkdown(`[one](${URL}) [two][ref] <${URL}>\n\n[ref]: ${URL}`, ALLOWED)
	const serialized = JSON.stringify(tree)
	expect(serialized.match(/"type":14/g)).toHaveLength(3)
	expect(serialized).not.toContain('"refs"')
})

test("rejected destinations stay inert with their labels, including unsafe schemes", () => {
	const tree = toSafeNoteMarkdown(`[**bold**](https://evil.test) [script](javascript:alert) <${URL}>`)
	const serialized = JSON.stringify(tree)
	expect(serialized).not.toContain('"type":14')
	expect(serialized).toContain("(https://evil.test)")
	expect(serialized).toContain("(javascript:alert)")
	expect(serialized.split(URL)).toHaveLength(2)
})

test("linked images disappear even inside lists, quotes and table cells", () => {
	const tree = toSafeNoteMarkdown(
		`- [![image](https://image.test)](${URL})\n\n> ![x](https://image.test)\n\n|a|\n|-|\n|![x](https://image.test)|`,
		ALLOWED,
	)
	const serialized = JSON.stringify(tree)
	expect(serialized).not.toContain("https://image.test")
	expect(serialized).not.toContain('"type":13')
	expect(serialized).not.toContain('"type":14')
})

test("formatted rejected URL labels show their destination once", () => {
	for (const label of [`**${URL}**`, `*${URL}*`, `\`${URL}\``]) {
		const serialized = JSON.stringify(toSafeNoteMarkdown(`[${label}](${URL})`))
		expect(serialized).not.toContain(` (${URL})`)
		expect(serialized).not.toContain('"type":14')
	}
})

test("raw HTML and code remain literal characters, never a second parse", () => {
	const tree = toSafeNoteMarkdown(
		'<a href="https://evil.test">raw</a>\n\n`[code](https://evil.test)`\n\n```html\n<img src=x>\n```',
	)
	const serialized = JSON.stringify(tree)
	expect(serialized).toContain("<a href=")
	expect(serialized).toContain("[code](https://evil.test)")
	expect(serialized).toContain("<img src=x>")
	expect(serialized).not.toContain('"type":14')
})

test("all six heading levels survive in the same compact presentation tree", () => {
	const tree = toSafeNoteMarkdown("# One\n## Two\n### Three\n#### Four\n##### Five\n###### Six")
	expect(tree.filter((node) => node.type === RuleType.heading).map((node) => node.level)).toEqual([1, 2, 3, 4, 5, 6])
})

test("malformed empty links and null nodes cannot become interactive content", () => {
	expect(
		toSafeNoteNodes(
			[null, { type: RuleType.link, target: URL, children: null }] as unknown as SafeNoteMarkdown,
			ALLOWED,
		),
	).toEqual([])
})
