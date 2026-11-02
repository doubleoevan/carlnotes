// the inventory table parser: rows come from the table under the heading alone, and a missing heading reads no rows
import { expect, test } from "bun:test"
import { parseInventoryTable } from "./parityInventory"

// an inventory with two tables, the second row's reason empty
const MARKDOWN = [
	"# Parity",
	"",
	"## Web-only client capabilities",
	"",
	"| Capability | Status | Reason or prompt |",
	"| --- | --- | --- |",
	"| `billingClient.fetchCheckoutUrl` | deferred | Prompt 55, store payments |",
	"| `adminClient.fetchAdminUsers` | web-only |  |",
	"",
	"## Separately built components",
	"",
	"| `ChatComposer` | not yet shared | each app builds its composer |",
].join("\n")

// the rows under the heading, up to the next heading, with an empty reason read as empty
test("the table is read under its heading and stops at the next one", () => {
	expect(parseInventoryTable({ markdown: MARKDOWN, heading: "## Web-only client capabilities" })).toEqual([
		{ name: "billingClient.fetchCheckoutUrl", status: "deferred", reason: "Prompt 55, store payments" },
		{ name: "adminClient.fetchAdminUsers", status: "web-only", reason: "" },
	])
	expect(parseInventoryTable({ markdown: MARKDOWN, heading: "## Separately built components" })).toEqual([
		{ name: "ChatComposer", status: "not yet shared", reason: "each app builds its composer" },
	])
})

// a heading the inventory lacks reads no rows
test("a missing heading reads no rows", () => {
	expect(parseInventoryTable({ markdown: MARKDOWN, heading: "## Roles" })).toEqual([])
})

// a heading or a row in a code fence or an HTML comment is hidden from the page, a row with a comment after its text
// is shown, and a deeper heading of the same text is ignored
test("hidden rows and headings, and a deeper heading, do not count", () => {
	const markdown = [
		"### Separately built components",
		"| `Decoy` | not yet shared | under the wrong heading |",
		"```",
		"## Separately built components",
		"| `FencedHeading` | not yet shared | under a fenced heading |",
		"```",
		"## Separately built components",
		"<!--",
		"| `Commented` | not yet shared | hidden |",
		"-->",
		"```",
		"| `Fenced` | not yet shared | hidden |",
		"```",
		"~~~~",
		"## Roles",
		"~~~",
		"| `Tilded` | not yet shared | hidden by a tilde fence |",
		"~~~~",
		"| `Shown` | not yet shared | listed |",
		"| `Noted` | not yet shared | listed <!-- with a note --> |",
	].join("\n")
	expect(parseInventoryTable({ markdown, heading: "## Separately built components" })).toEqual([
		{ name: "Shown", status: "not yet shared", reason: "listed" },
		{ name: "Noted", status: "not yet shared", reason: "listed <!-- with a note -->" },
	])
})
