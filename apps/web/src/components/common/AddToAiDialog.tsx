import { AddToAi, type AddToAiElements } from "@carlnotes/core/components/AddToAi"
import { Check, Code2, Copy, Link, MessageCircle } from "lucide-react"
import type { ComponentType } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/primitives/dialog"
import { SHARE_OPTION_CLASS, SHARE_OPTION_ICON_CLASS } from "@/components/share/ShareOptions"
import {
	type AiProvider,
	type McpServer,
	readLastAiProvider,
	storeAiProvider,
	toInstallDeeplink,
} from "@/lib/installDeeplinks"
import { MENU_DIVIDER_CLASS } from "@/lib/styleClasses"
import { copyToClipboard } from "@/lib/utils"
import { AnchorLink } from "./AnchorLink"
import { BrandIcon } from "./BrandIcon"

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

/**
 * Presents the shared AI provider instructions with web installation links and clipboard feedback.
 */
export function AddToAiDialog({ mcpServer, onClose }: { mcpServer: McpServer; onClose: () => void }) {
	return (
		<Dialog open onOpenChange={onClose}>
			<DialogContent className="gap-2 p-4 sm:max-w-sm">
				{/* the title and shared provider list */}
				<DialogTitle>Add to AI</DialogTitle>
				<DialogDescription>Carl's ready to collaborate with your AI.</DialogDescription>
				<AddToAi
					elements={ELEMENTS}
					mcpServer={mcpServer}
					lastProvider={readLastAiProvider()}
					onRemember={storeAiProvider}
					onCopy={(text) =>
						copyToClipboard(
							text,
							text === mcpServer.url
								? "Server URL copied. Paste it wherever your AI keeps its connectors."
								: "Command copied. Run it in your terminal.",
						)
					}
					renderInstall={({ provider, onSelect }) => {
						const { label, Icon } = AI_PROVIDER_OPTIONS[provider]
						return (
							<AnchorLink
								href={toInstallDeeplink(provider, mcpServer)}
								onClick={onSelect}
								className={SHARE_OPTION_CLASS}
							>
								<Icon className={SHARE_OPTION_ICON_CLASS} />
								{label}
							</AnchorLink>
						)
					}}
				/>
			</DialogContent>
		</Dialog>
	)
}

// keep the platform elements stable while the shared instructions expand
const ELEMENTS: AddToAiElements = {
	Group: ({ children }) => <div className="grid">{children}</div>,
	Details: ({ children }) => (
		<div className="text-muted-foreground mb-2 ml-6 grid gap-2 text-sm leading-relaxed">{children}</div>
	),
	Text: ({ children }) => <p>{children}</p>,
	Option: ({ provider, label, isOpen, onSelect }) => {
		const Icon = provider ? AI_PROVIDER_OPTIONS[provider].Icon : Link
		return (
			<button type="button" onClick={onSelect} aria-expanded={isOpen} className={SHARE_OPTION_CLASS}>
				<Icon className={SHARE_OPTION_ICON_CLASS} />
				{label}
			</button>
		)
	},
	CopyBox: ({ text, label, isCopied, onCopy }) => (
		<div className="flex items-center gap-2">
			<code className="bg-muted min-w-0 flex-1 rounded px-2 py-1 text-xs break-all">{text}</code>
			<button
				type="button"
				onClick={onCopy}
				aria-label={isCopied ? `${label}, copied` : label}
				className="hover:text-foreground"
			>
				{isCopied ? <Check className="size-4 text-link" /> : <Copy className="size-4" />}
			</button>
		</div>
	),
	Divider: () => <div className={MENU_DIVIDER_CLASS} />,
}
