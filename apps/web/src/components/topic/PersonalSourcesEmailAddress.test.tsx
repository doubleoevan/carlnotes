// render the shared address through the web adapter without provisioning any per-reader destination
import { expect, test } from "bun:test"
import { PersonalSourcesEmailAddress } from "@carlnotes/core/components/PersonalSourcesEmailAddress"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"
import { PERSONAL_SOURCES_ELEMENTS } from "./personalSourcesElements"

test("the shared address display and copy use the server's environment value", async () => {
	// supply the same address returned by the server and capture the clipboard request
	const address = "carl@inbox-dev.example.com"
	const copies: string[] = []
	const harness = await renderTestHook(
		() => null,
		() => (
			<PersonalSourcesEmailAddress
				address={address}
				elements={PERSONAL_SOURCES_ELEMENTS}
				onCopy={async (value) => {
					copies.push(value)
					return true
				}}
			/>
		),
	)
	try {
		// show only the configured mailbox hint and copy control
		expect(harness.container.textContent).toContain(address)
		expect(harness.container.textContent).not.toContain("topic:")
		expect(harness.container.textContent).toContain(`Email Carl at ${address}.`)
		expect(harness.container.textContent).not.toContain("carl@example.com")
		const copyButton = harness.container.querySelector("button")
		expect(copyButton?.textContent).toBe("Copy")
		await act(async () => copyButton?.click())
		expect(copies).toEqual([address])
		expect(copyButton?.textContent).toBe("Copied")
	} finally {
		await harness.close()
	}
})
