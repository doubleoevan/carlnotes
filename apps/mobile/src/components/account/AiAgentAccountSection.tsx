import { AI_AGENT_API_KEY_LABEL_MAX_CHARS } from "@carlnotes/contracts/personalSourcesAccounts"
import { SITE_URL } from "@carlnotes/contracts/site"
import { AiAgentAccountCard, type AiAgentAccountElements } from "@carlnotes/core/components/AiAgentAccountCard"
import { AiAgentAccountSection as SharedAiAgentAccountSection } from "@carlnotes/core/components/AiAgentAccountSection"
import type { AiAgentAccountState } from "@carlnotes/core/hooks/useAiAgentAccount"
import { toCarlNotesMcpServer } from "@carlnotes/core/lib/installDeeplinks"
import { ExternalLink } from "lucide-react-native"
import { View } from "react-native"
import { copyText } from "@/clipboard"
import { AddToAiDialog } from "@/components/common/AddToAiDialog"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SessionTextInput } from "@/components/session/SessionTextInput"
import { ProviderMark } from "@/components/topic/personalSourcesElements"
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
	Button: ({ label, accessibilityLabel, onPress, isDisabled, isHighlighted }) => (
		<Button
			variant={isHighlighted ? "default" : "outline"}
			size="sm"
			accessibilityLabel={accessibilityLabel ?? label}
			onPress={onPress}
			disabled={isDisabled}
			className="h-auto min-h-8 max-w-full self-start py-1.5"
		>
			<Text className="shrink">{label}</Text>
		</Button>
	),
	Field: ({ label, value, onChange, onSubmit }) => (
		<View className="flex-1">
			<SessionTextInput
				label={label}
				isLabelVisible={false}
				placeholder={label}
				value={value}
				onChangeText={onChange}
				onSubmitEditing={onSubmit}
				returnKeyType="done"
				maxLength={AI_AGENT_API_KEY_LABEL_MAX_CHARS}
				autoComplete="off"
			/>
		</View>
	),
	Confirm: ConfirmDialog,
	Row: ({ children }) => <View className="mt-3 flex-row items-center justify-between gap-3">{children}</View>,
	AppName: ({ label, provider }) => (
		<View className="shrink flex-row items-center gap-2">
			<ProviderMark provider={provider} colorClass="text-foreground" isLarge />
			<Text numberOfLines={1} className="shrink text-sm font-semibold">
				{label}
			</Text>
		</View>
	),
	KeyName: ({ label, details }) => (
		<View className="shrink">
			<Text numberOfLines={1} className="text-sm font-semibold">
				{label}
			</Text>
			<Text className="text-sm text-muted-foreground">{details}</Text>
		</View>
	),
	AddToAiDialog: ({ initialProvider, onClose }) => (
		<AddToAiDialog mcpServer={toCarlNotesMcpServer(SITE_URL)} initialProvider={initialProvider} onClose={onClose} />
	),
	DocsLink: ({ href, children }) => (
		<AnchorLink
			href={href}
			accessibilityRole="link"
			accessibilityLabel={children}
			className="flex-row items-center gap-1 self-start"
		>
			<Text className="text-sm text-link">{children}</Text>
			<Icon as={ExternalLink} className="size-3 text-link" />
		</AnchorLink>
	),
	Secret: ({ children }) => (
		<Text selectable className="rounded border border-separator p-3 text-sm">
			{children}
		</Text>
	),
}
