import { AiAgentAccountCard, type AiAgentAccountElements } from "@carlnotes/core/components/AiAgentAccountCard"
import { AiAgentAccountSection as SharedAiAgentAccountSection } from "@carlnotes/core/components/AiAgentAccountSection"
import type { AiAgentAccountState } from "@carlnotes/core/hooks/useAiAgentAccount"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Label } from "@/components/primitives/label"
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

// use the existing account controls and keep a displayed key out of capture tools
const ELEMENTS: AiAgentAccountElements = {
	...ACCOUNT_FIELD_ELEMENTS,
	Button: ({ label, onPress, isDisabled }) => (
		<Button
			type="button"
			variant="outline"
			size="sm"
			onClick={onPress}
			disabled={isDisabled}
			className="h-auto min-h-8 max-w-full whitespace-normal break-words py-1.5 text-left"
		>
			{label}
		</Button>
	),
	Field: ({ label, value, onChange }) => (
		<div className="space-y-1.5">
			<Label htmlFor="ai-agent-key-label">{label}</Label>
			<Input
				id="ai-agent-key-label"
				type="text"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				maxLength={80}
				autoComplete="off"
				className="bg-card"
			/>
		</div>
	),
	Confirm: ConfirmDialog,
	Secret: ({ children }) => (
		<code className="ph-no-capture block break-all rounded border border-separator p-3 text-sm" data-private>
			{children}
		</code>
	),
}
