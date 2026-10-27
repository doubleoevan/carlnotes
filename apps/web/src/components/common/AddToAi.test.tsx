import { expect, test } from "bun:test"
import { AddToAi, type AddToAiElements, type AddToAiInstallProps } from "@carlnotes/core/components/AddToAi"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

// render the portable controls through a minimal DOM adapter
const ELEMENTS: AddToAiElements = {
	Group: ({ children }) => <div>{children}</div>,
	Details: ({ children }) => <section>{children}</section>,
	Text: ({ children }) => <p>{children}</p>,
	Option: ({ label, isOpen, onSelect }) => (
		<button type="button" aria-expanded={isOpen} onClick={onSelect}>
			{label}
		</button>
	),
	CopyBox: ({ isCopied, onCopy }) => (
		<button type="button" onClick={onCopy}>
			{isCopied ? "Copied" : "Copy"}
		</button>
	),
	Divider: () => <hr />,
}

// exercise the native installation adapter's shared selection and copy contract
function InstallOption({ provider, isOpen, isCopied, onSelect, onCopy }: AddToAiInstallProps) {
	return (
		<div>
			<button type="button" aria-expanded={isOpen} onClick={onSelect}>
				{provider}
			</button>
			{isOpen && (
				<section>
					<button type="button" onClick={onCopy}>
						{isCopied ? "Copied" : "Copy"}
					</button>
				</section>
			)}
		</div>
	)
}

test("provider switches close desktop instructions and clipboard failures never claim success", async () => {
	// mount the shared list with controlled clipboard outcomes
	let canCopy = false
	const rememberedProviders: string[] = []
	const harness = await renderTestHook(
		() => null,
		() => (
			<AddToAi
				elements={ELEMENTS}
				mcpServer={{ name: "Test", url: "https://example.com/mcp" }}
				lastProvider={null}
				onRemember={(provider) => rememberedProviders.push(provider)}
				onCopy={async () => canCopy}
				renderInstall={(props) => <InstallOption {...props} />}
			/>
		),
	)
	try {
		// switch between both installation options and a paste provider
		for (const label of ["cursor", "vscode", "Claude"]) {
			const button = Array.from(harness.container.querySelectorAll("button")).find(
				(button) => button.textContent === label,
			)
			expect(button).toBeDefined()
			await act(async () => button?.click())
			expect(harness.container.querySelectorAll('[aria-expanded="true"]').length).toBe(1)
			expect(harness.container.querySelectorAll("section").length).toBe(1)
		}
		expect(rememberedProviders).toEqual(["cursor", "vscode", "claude"])

		// preserve copy feedback until the clipboard acknowledges success
		const copyButton = harness.container.querySelector("section button") as HTMLButtonElement
		await act(async () => copyButton.click())
		expect(copyButton.textContent).toBe("Copy")
		canCopy = true
		await act(async () => copyButton.click())
		expect(copyButton.textContent).toBe("Copied")
	} finally {
		await harness.close()
	}
})
