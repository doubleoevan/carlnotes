import { AiAgentAccountCard, type AiAgentAccountElements } from "@carlnotes/core/components/AiAgentAccountCard"
import { AiAgentAccountSection as SharedAiAgentAccountSection } from "@carlnotes/core/components/AiAgentAccountSection"
import type { AiAgentAccountState } from "@carlnotes/core/hooks/useAiAgentAccount"
import { copyText } from "@/clipboard"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { SessionTextInput } from "@/components/session/SessionTextInput"
import { ACCOUNT_FIELD_ELEMENTS } from "./AccountFields"

/**
 * Adapts shared AI Agent account controls to native fields, confirmation, and clipboard.
 */
export function AiAgentAccountSection({ account }: { account?: AiAgentAccountState }) {
	return account ? (
		<AiAgentAccountCard elements={ELEMENTS} account={account} onCopy={copyText} />
	) : (
		<SharedAiAgentAccountSection elements={ELEMENTS} onCopy={copyText} />
	)
}

// keep the browser's content order with a selectable, wrapping key
const ELEMENTS: AiAgentAccountElements = {
	...ACCOUNT_FIELD_ELEMENTS,
	Button: ({ label, onPress, isDisabled }) => (
		<Button
			variant="outline"
			size="sm"
			accessibilityLabel={label}
			onPress={onPress}
			disabled={isDisabled}
			className="h-auto min-h-8 max-w-full self-start py-1.5"
		>
			<Text className="shrink">{label}</Text>
		</Button>
	),
	Field: ({ label, value, onChange }) => (
		<SessionTextInput label={label} value={value} onChangeText={onChange} maxLength={80} autoComplete="off" />
	),
	Confirm: ConfirmDialog,
	Secret: ({ children }) => (
		<Text selectable className="rounded border border-separator p-3 text-sm">
			{children}
		</Text>
	),
}
