import { expect, test } from "bun:test"
import { PageActionMenu, type PageActionOption } from "@carlnotes/core/components/PageActionMenu"
import { type UserMenuElements, UserMenuItems } from "@carlnotes/core/components/UserMenuItems"
import { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { renderTestHook } from "@/lib/hookTestHarness"

// exercise the actual shared composition through tiny DOM controls
function Option({ label, isDisabled, onSelect }: PageActionOption<string>) {
	return (
		<button type="button" disabled={isDisabled} onClick={onSelect}>
			{label}
		</button>
	)
}

test("global actions remain available and close their menu before opening another form", async () => {
	const calls: string[] = []
	const harness = await renderTestHook(
		() => null,
		() => (
			<PageActionMenu
				icons={{ Plus: "plus", Bot: "bot", Flag: "flag" }}
				Option={Option}
				onNewTopic={() => calls.push("new")}
				onAddToAi={() => calls.push("ai")}
				onReport={() => calls.push("report")}
				onClose={() => calls.push("close")}
			/>
		),
	)
	try {
		const buttons = Array.from(harness.container.querySelectorAll("button"))
		expect(buttons.map((button) => button.textContent)).toEqual(["New topic", "Add to AI", "Report issue"])
		await act(async () => {
			buttons[0]?.click()
			buttons[1]?.click()
			buttons[2]?.click()
		})
		expect(calls).toEqual(["close", "new", "close", "ai", "close", "report"])
	} finally {
		await harness.close()
	}
})

test("pages with a New Topic button omit only that duplicate menu action", () => {
	const html = renderToStaticMarkup(
		<PageActionMenu
			icons={{ Plus: "plus", Bot: "bot", Flag: "flag" }}
			Option={Option}
			hasNewTopicButton
			onNewTopic={() => {}}
			onAddToAi={() => {}}
			onClose={() => {}}
		/>,
	)
	expect(html).not.toContain("New topic")
	expect(html).toContain("Add to AI")
	expect(html).not.toContain("Report issue")
})

// preserve selected destinations and permission gates in both menu adapters
const ELEMENTS: UserMenuElements = {
	Link: ({ label, href, isSelected }) => (
		<a href={href} aria-current={isSelected ? "page" : undefined}>
			{label}
		</a>
	),
	Action: ({ label }) => <button type="button">{label}</button>,
	Divider: () => <hr />,
}
test("the common navigation selects the current account and hides admin from non-admins", () => {
	const props = {
		elements: ELEMENTS,
		userId: "reader",
		pathname: "/account",
		onNavigate: () => {},
		onPlayTutorial: () => {},
		onSignOut: () => {},
	}
	const html = renderToStaticMarkup(<UserMenuItems {...props} isAdmin={false} />)
	expect(html).toContain('href="/account" aria-current="page"')
	expect(html).toContain('href="/profiles/reader"')
	expect(html).not.toContain('href="/admin"')
	expect(renderToStaticMarkup(<UserMenuItems {...props} isAdmin />)).toContain('href="/admin"')
})
