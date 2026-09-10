import { Code2, Copy, Link, MessageCircle } from "lucide-react"
import type { ComponentType } from "react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { BrandIcon } from "@/components/common/BrandIcon"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/primitives/dialog"
import { CopyLinkOption, SHARE_OPTION_CLASS, SHARE_OPTION_ICON_CLASS } from "@/components/share/ShareOptions"
import {
	type AiProvider,
	type DeeplinkAiProvider,
	type McpServer,
	PASTE_STEPS,
	type PasteAiProvider,
	readLastAiProvider,
	storeAiProvider,
	toInstallDeeplink,
	toSortedAiProviders,
} from "@/lib/installDeeplinks"
import { copyToClipboard } from "@/lib/utils"

// the brand logos from simple-icons. it has none for ChatGPT, VS Code, or xAI, so a lucide icon stands in for the
// first two and the X logo for Grok
const ClaudeIcon: ComponentType<{ className?: string }> = ({ className }) => (
	<BrandIcon brand="claude" className={className} />
)
const GeminiIcon: ComponentType<{ className?: string }> = ({ className }) => (
	<BrandIcon brand="gemini" className={className} />
)
const GrokIcon: ComponentType<{ className?: string }> = ({ className }) => <BrandIcon brand="x" className={className} />
const PerplexityIcon: ComponentType<{ className?: string }> = ({ className }) => (
	<BrandIcon brand="perplexity" className={className} />
)
const DeepseekIcon: ComponentType<{ className?: string }> = ({ className }) => (
	<BrandIcon brand="deepseek" className={className} />
)
const CursorIcon: ComponentType<{ className?: string }> = ({ className }) => (
	<BrandIcon brand="cursor" className={className} />
)

// the label and icon mapped to each AI provider's option
const AI_PROVIDER_OPTIONS: Record<AiProvider, { label: string; Icon: ComponentType<{ className?: string }> }> = {
	claude: { label: "Claude", Icon: ClaudeIcon },
	chatgpt: { label: "ChatGPT", Icon: MessageCircle },
	gemini: { label: "Gemini", Icon: GeminiIcon },
	grok: { label: "Grok", Icon: GrokIcon },
	perplexity: { label: "Perplexity", Icon: PerplexityIcon },
	deepseek: { label: "DeepSeek", Icon: DeepseekIcon },
	cursor: { label: "Cursor", Icon: CursorIcon },
	vscode: { label: "VS Code", Icon: Code2 },
}

// what the copy toast says
const COPIED_MCP_TOAST = "Server URL copied. Paste it wherever your AI keeps its connectors."
// the command toast names the provider the command introduces
const toCommandCopiedToast = (aiProviderLabel: string): string =>
	`Command copied. Run it in your terminal to introduce ${aiProviderLabel} to Carl.`

/**
 * Lists the supported AI providers, the last one used first, and the Copy mcp URL option.
 */
export function AddToAiDialog({ mcpServer, onClose }: { mcpServer: McpServer; onClose: () => void }) {
	// show the sorted list of AI providers, with the last one used first
	const [sortedAiProviders] = useState(() => toSortedAiProviders(readLastAiProvider()))
	// the AI provider whose paste steps are open, and whether the url was copied
	const [openPasteAiProvider, setOpenPasteAiProvider] = useState<PasteAiProvider | null>(null)
	const [isMcpUrlCopied, setIsMcpUrlCopied] = useState(false)

	// the mcp url also confirms in place, on the copy option
	const handleCopyMcpUrl = async (): Promise<void> => {
		if (await copyToClipboard(mcpServer.url, COPIED_MCP_TOAST)) {
			setIsMcpUrlCopied(true)
		}
	}
	const handleCopyAddMcpCommand = async (addMcpCommand: string, aiProviderLabel: string): Promise<void> => {
		await copyToClipboard(addMcpCommand, toCommandCopiedToast(aiProviderLabel))
	}

	// remember the AI provider, and open its paste steps or close them
	const handleTogglePasteAiProviderSteps = (pasteAiProvider: PasteAiProvider): void => {
		storeAiProvider(pasteAiProvider)
		setOpenPasteAiProvider(openPasteAiProvider === pasteAiProvider ? null : pasteAiProvider)
	}

	return (
		<Dialog open onOpenChange={onClose}>
			<DialogContent className="gap-2 p-4 sm:max-w-sm">
				{/* the title and carl's one line under it */}
				<DialogTitle>Add to AI</DialogTitle>
				<DialogDescription>Carl's ready to collaborate with your AI.</DialogDescription>
				{/* one list, the remembered provider first, the copy option always last */}
				<div className="grid">
					{sortedAiProviders.map((aiProvider) =>
						aiProvider === "cursor" || aiProvider === "vscode" ? (
							<DeeplinkAiProviderOption key={aiProvider} deeplinkAiProvider={aiProvider} mcpServer={mcpServer} />
						) : (
							<PasteAiProviderOption
								key={aiProvider}
								pasteAiProvider={aiProvider}
								mcpServer={mcpServer}
								isOpen={openPasteAiProvider === aiProvider}
								onSelect={() => handleTogglePasteAiProviderSteps(aiProvider)}
								onCopyServerUrl={handleCopyMcpUrl}
								onCopyCommand={handleCopyAddMcpCommand}
							/>
						),
					)}
					<div className="bg-border my-1 h-px" />
					<CopyLinkOption
						label="Copy server URL"
						icon={<Link className={SHARE_OPTION_ICON_CLASS} />}
						className={SHARE_OPTION_CLASS}
						isCopied={isMcpUrlCopied}
						onCopy={() => void handleCopyMcpUrl()}
					/>
				</div>
			</DialogContent>
		</Dialog>
	)
}

// a one-click install option. the click follows the install link and remembers the ai provider
function DeeplinkAiProviderOption({
	deeplinkAiProvider,
	mcpServer,
}: {
	deeplinkAiProvider: DeeplinkAiProvider
	mcpServer: McpServer
}) {
	const { label, Icon } = AI_PROVIDER_OPTIONS[deeplinkAiProvider]
	return (
		<AnchorLink
			href={toInstallDeeplink(deeplinkAiProvider, mcpServer)}
			onClick={() => storeAiProvider(deeplinkAiProvider)}
			className={SHARE_OPTION_CLASS}
		>
			<Icon className={SHARE_OPTION_ICON_CLASS} />
			{label}
		</AnchorLink>
	)
}

// a paste option. open, it shows the steps, the url, and the add command where there is one, each with a copy button
function PasteAiProviderOption({
	pasteAiProvider,
	mcpServer,
	isOpen,
	onSelect,
	onCopyServerUrl,
	onCopyCommand,
}: {
	pasteAiProvider: PasteAiProvider
	mcpServer: McpServer
	isOpen: boolean
	onSelect: () => void
	onCopyServerUrl: () => Promise<void>
	onCopyCommand: (command: string, providerLabel: string) => Promise<void>
}) {
	const { label, Icon } = AI_PROVIDER_OPTIONS[pasteAiProvider]
	const { steps, command } = PASTE_STEPS[pasteAiProvider]
	return (
		<div>
			<button type="button" onClick={onSelect} aria-expanded={isOpen} className={SHARE_OPTION_CLASS}>
				<Icon className={SHARE_OPTION_ICON_CLASS} />
				{label}
			</button>
			{/* the steps, the url to paste, and the command to add an AI provider where there is one */}
			{isOpen && (
				<div className="text-muted-foreground mb-2 ml-6 grid gap-2 text-sm leading-relaxed">
					<p>{steps}</p>
					<CopyBox text={mcpServer.url} copyLabel="Copy server URL" onCopy={onCopyServerUrl} />
					{command && (
						<>
							<p>{`Or in ${command.tool}:`}</p>
							<CopyBox
								text={`${command.line} ${mcpServer.url}`}
								copyLabel={`Copy ${command.tool} command`}
								onCopy={() => onCopyCommand(`${command.line} ${mcpServer.url}`, label)}
							/>
						</>
					)}
				</div>
			)}
		</div>
	)
}

// the text to paste, in a box with its copy button
function CopyBox({ text, copyLabel, onCopy }: { text: string; copyLabel: string; onCopy: () => Promise<void> }) {
	return (
		<div className="flex items-center gap-2">
			<code className="bg-muted min-w-0 flex-1 rounded px-2 py-1 text-xs break-all">{text}</code>
			<button type="button" onClick={() => void onCopy()} aria-label={copyLabel} className="hover:text-foreground">
				<Copy className="size-4" />
			</button>
		</div>
	)
}
