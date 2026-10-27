import { type ComponentType, type ReactNode, useState } from "react"
import { type AiProvider, type McpServer, PASTE_STEPS, toSortedAiProviders } from "../lib/installDeeplinks"

// keep provider labels and all expandable content identical across clients
export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
	claude: "Claude",
	chatgpt: "ChatGPT",
	gemini: "Gemini",
	grok: "Grok",
	perplexity: "Perplexity",
	deepseek: "DeepSeek",
	cursor: "Cursor",
	vscode: "VS Code",
}
export type AddToAiElements = {
	Group: ComponentType<{ children: ReactNode }>
	Details: ComponentType<{ children: ReactNode }>
	Text: ComponentType<{ children: ReactNode }>
	Option: ComponentType<{ provider?: AiProvider; label: string; isOpen?: boolean; onSelect: () => void }>
	CopyBox: ComponentType<{ text: string; label: string; isCopied?: boolean; onCopy: () => void }>
	Divider: ComponentType
}

// installation controls share selection and clipboard feedback with the provider list
export type AddToAiInstallProps = {
	provider: "cursor" | "vscode"
	mcpServer: McpServer
	isOpen: boolean
	isCopied: boolean
	onSelect: () => void
	onCopy: () => void
}

/**
 * Shares provider ordering, instructions, commands, and copy feedback between web and mobile.
 */
export function AddToAi({
	elements,
	mcpServer,
	lastProvider,
	onRemember,
	onCopy,
	renderInstall,
}: {
	elements: AddToAiElements
	mcpServer: McpServer
	lastProvider: AiProvider | null
	onRemember: (provider: AiProvider) => void
	onCopy: (text: string) => Promise<boolean>
	renderInstall: (props: AddToAiInstallProps) => ReactNode
}) {
	// retain the initial order while opening providers and confirming successful copies
	const [providers] = useState(() => toSortedAiProviders(lastProvider))
	const [openProvider, setOpenProvider] = useState<AiProvider | null>(null)
	const [copiedText, setCopiedText] = useState<string | null>(null)
	const { Group, Details, Text, Option, CopyBox, Divider } = elements
	async function handleCopy(text: string): Promise<void> {
		if (await onCopy(text)) {
			setCopiedText(text)
		}
	}

	// remember the provider and keep only its instructions open
	function handleSelect(provider: AiProvider): void {
		onRemember(provider)
		setOpenProvider(openProvider === provider ? null : provider)
	}
	return (
		<Group>
			{/* the remembered provider leads, with the same expandable instructions */}
			{providers.map((provider) => {
				if (provider === "cursor" || provider === "vscode") {
					return (
						<Group key={provider}>
							{renderInstall({
								provider,
								mcpServer,
								isOpen: openProvider === provider,
								isCopied: copiedText === mcpServer.url,
								onSelect: () => handleSelect(provider),
								onCopy: () => void handleCopy(mcpServer.url),
							})}
						</Group>
					)
				}
				const { steps, command } = PASTE_STEPS[provider]
				return (
					<Group key={provider}>
						<Option
							provider={provider}
							label={AI_PROVIDER_LABELS[provider]}
							isOpen={openProvider === provider}
							onSelect={() => handleSelect(provider)}
						/>
						{openProvider === provider && (
							<Details>
								<Text>{steps}</Text>
								<CopyBox
									text={mcpServer.url}
									label="Copy server URL"
									isCopied={copiedText === mcpServer.url}
									onCopy={() => void handleCopy(mcpServer.url)}
								/>
								{command && (
									<>
										<Text>{`Or in ${command.tool}:`}</Text>
										<CopyBox
											text={`${command.line} ${mcpServer.url}`}
											label={`Copy ${command.tool} command`}
											isCopied={copiedText === `${command.line} ${mcpServer.url}`}
											onCopy={() => void handleCopy(`${command.line} ${mcpServer.url}`)}
										/>
									</>
								)}
							</Details>
						)}
					</Group>
				)
			})}
			{/* direct server URL copy remains available without choosing a provider */}
			<Divider />
			<Option
				label={copiedText === mcpServer.url ? "Copied" : "Copy server URL"}
				onSelect={() => void handleCopy(mcpServer.url)}
			/>
		</Group>
	)
}
