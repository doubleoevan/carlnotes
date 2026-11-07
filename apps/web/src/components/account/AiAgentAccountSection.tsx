import { AI_AGENT_API_KEY_LABEL_MAX_CHARS } from "@carlnotes/contracts/personalSourcesAccounts"
import { AiAgentAccountCard, type AiAgentAccountElements } from "@carlnotes/core/components/AiAgentAccountCard"
import { AiAgentAccountSection as SharedAiAgentAccountSection } from "@carlnotes/core/components/AiAgentAccountSection"
import type { AiAgentAccountState } from "@carlnotes/core/hooks/useAiAgentAccount"
import { type AiProvider, toCarlNotesMcpServer } from "@carlnotes/core/lib/installDeeplinks"
import { ExternalLink } from "lucide-react"
import { AddToAiDialog } from "@/components/common/AddToAiDialog"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { ProviderMark } from "@/components/topic/personalSourcesElements"
import { useOrigin } from "@/hooks/useBrowserValue"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { copyToClipboard } from "@/lib/utils"
import { ACCOUNT_FIELD_ELEMENTS } from "./AccountFields"

/**
 * Adapts shared AI Agent account controls to the browser's fields, confirmation, and clipboard.
 */
export function AiAgentAccountSection({ account }: { account?: AiAgentAccountState }) {
	return account ? (
		<AiAgentAccountCard elements={ELEMENTS} account={account} onCopy={copyToClipboard} />
	) : (
		<SharedAiAgentAccountSection elements={ELEMENTS} onCopy={copyToClipboard} />
	)
}

// reconnect through the same dialog as the page actions menu
function AccountAddToAiDialog({ initialProvider, onClose }: { initialProvider?: AiProvider; onClose: () => void }) {
	const origin = useOrigin()
	return <AddToAiDialog mcpServer={toCarlNotesMcpServer(origin)} initialProvider={initialProvider} onClose={onClose} />
}

// use the existing account controls and keep a displayed key out of capture tools
const ELEMENTS: AiAgentAccountElements = {
	...ACCOUNT_FIELD_ELEMENTS,
	Button: ({ label, accessibilityLabel, onPress, isDisabled, isHighlighted }) => (
		<Button
			type="button"
			variant={isHighlighted ? "default" : "outline"}
			size="sm"
			aria-label={accessibilityLabel}
			onClick={onPress}
			disabled={isDisabled}
			className="h-auto min-h-8 max-w-full whitespace-normal break-words py-1.5 text-left shrink-0"
		>
			{label}
		</Button>
	),
	Field: ({ label, value, onChange, onSubmit }) => (
		<Input
			type="text"
			aria-label={label}
			placeholder={label}
			value={value}
			onChange={(event) => onChange(event.target.value)}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					onSubmit?.()
				}
			}}
			maxLength={AI_AGENT_API_KEY_LABEL_MAX_CHARS}
			autoComplete="off"
			className="min-w-0 flex-1 bg-card"
		/>
	),
	Confirm: ConfirmDialog,
	Row: ({ children }) => (
		<div className="mt-3 flex max-w-sm items-center justify-between gap-3 text-sm">{children}</div>
	),
	AppName: ({ label, provider }) => (
		<span className="flex min-w-0 items-center gap-2 font-semibold">
			<ProviderMark provider={provider} isLarge />
			<span className="truncate">{label}</span>
		</span>
	),
	KeyName: ({ label, details }) => (
		<span className="flex min-w-0 flex-col">
			<span className="truncate font-semibold">{label}</span>
			<span className="text-muted-foreground">{details}</span>
		</span>
	),
	AddToAiDialog: AccountAddToAiDialog,
	DocsLink: ({ href, children }) => (
		<AnchorLink href={href} className={`${STANDALONE_LINK_CLASS} inline-flex items-center gap-1 text-sm`}>
			{children}
			<ExternalLink aria-hidden className="size-3 shrink-0" />
		</AnchorLink>
	),
	Secret: ({ children }) => (
		<code className="ph-no-capture block break-all rounded border border-separator p-3 text-sm" data-private>
			{children}
		</code>
	),
}
