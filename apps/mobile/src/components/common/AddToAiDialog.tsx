import { showClientError } from "@carlnotes/client/apiClient"
import {
	AddToAi,
	type AddToAiElements,
	type AddToAiInstallProps,
	AI_PROVIDER_LABELS,
} from "@carlnotes/core/components/AddToAi"
import {
	AI_PROVIDERS,
	type AiProvider,
	LAST_AI_PROVIDER_KEY,
	type McpServer,
} from "@carlnotes/core/lib/installDeeplinks"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { setStringAsync } from "expo-clipboard"
import { Check, Code2, Copy, Link, MessageCircle } from "lucide-react-native"
import { useEffect, useState } from "react"
import { View } from "react-native"
import { Path } from "react-native-svg"
import { siClaudecode, siCursor, siDeepseek, siGooglegemini, siPerplexity, siX } from "simple-icons"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { ClassNameSvg } from "./ClassNameSvg"
import { Sheet } from "./Sheet"

/**
 * Reuses the web's AI instructions and copy controls inside a native sheet.
 */
export function AddToAiDialog({ mcpServer, onClose }: { mcpServer: McpServer; onClose: () => void }) {
	// restore the remembered provider before mounting the ordered list
	const [lastProvider, setLastProvider] = useState<AiProvider | null | undefined>(undefined)
	useEffect(() => {
		let isCurrent = true
		void AsyncStorage.getItem(LAST_AI_PROVIDER_KEY)
			.catch(() => null)
			.then((saved) => {
				if (isCurrent) {
					setLastProvider(AI_PROVIDERS.find((provider) => provider === saved) ?? null)
				}
			})
		return () => {
			isCurrent = false
		}
	}, [])
	return (
		<Sheet title="Add to AI" onClose={onClose}>
			{/* shared instructions and copyable desktop configuration */}
			<Text className="mb-2 text-sm text-muted-foreground">Carl's ready to collaborate with your AI.</Text>
			{lastProvider !== undefined && (
				<AddToAi
					elements={ELEMENTS}
					mcpServer={mcpServer}
					lastProvider={lastProvider}
					onRemember={rememberProvider}
					onCopy={copyText}
					renderInstall={(props) => <DesktopInstall {...props} />}
				/>
			)}
		</Sheet>
	)
}

// retain all provider choices without trying to launch desktop URL schemes on a phone
function DesktopInstall({ provider, mcpServer, isOpen, isCopied, onSelect, onCopy }: AddToAiInstallProps) {
	return (
		<View>
			<ELEMENTS.Option provider={provider} label={AI_PROVIDER_LABELS[provider]} isOpen={isOpen} onSelect={onSelect} />
			{isOpen && (
				<ELEMENTS.Details>
					<ELEMENTS.Text>{`Install in ${AI_PROVIDER_LABELS[provider]} on your computer. Add this HTTP MCP server URL in its MCP settings.`}</ELEMENTS.Text>
					<ELEMENTS.CopyBox text={mcpServer.url} label="Copy server URL" isCopied={isCopied} onCopy={onCopy} />
				</ELEMENTS.Details>
			)}
		</View>
	)
}

// keep the web's Simple Icons brand marks and Lucide fallbacks
const BRANDS = {
	claude: siClaudecode,
	gemini: siGooglegemini,
	grok: siX,
	perplexity: siPerplexity,
	deepseek: siDeepseek,
	cursor: siCursor,
}
function ProviderIcon({ provider }: { provider?: AiProvider }) {
	if (!provider || provider === "chatgpt" || provider === "vscode") {
		return <Icon as={!provider ? Link : provider === "chatgpt" ? MessageCircle : Code2} className="size-4" />
	}
	return (
		<ClassNameSvg width={16} height={16} viewBox="0 0 24 24" className="text-foreground">
			<Path d={BRANDS[provider].path} fill="currentColor" />
		</ClassNameSvg>
	)
}

// native controls keep the same content with readable fields and full touch targets
const ELEMENTS: AddToAiElements = {
	Group: ({ children }) => <View>{children}</View>,
	Details: ({ children }) => <View className="mb-2 ml-6 gap-2">{children}</View>,
	Text: ({ children }) => <Text className="text-sm leading-relaxed text-muted-foreground">{children}</Text>,
	Option: ({ provider, label, isOpen, onSelect }) => (
		<Button
			variant="ghost"
			className="min-h-12 justify-start px-2"
			accessibilityLabel={label}
			accessibilityState={{ expanded: isOpen }}
			onPress={onSelect}
		>
			<ProviderIcon provider={provider} />
			<Text>{label}</Text>
		</Button>
	),
	CopyBox: ({ text, label, isCopied, onCopy }) => (
		<View className="flex-row items-center gap-2">
			<Text selectable className="min-w-0 flex-1 rounded bg-muted px-2 py-1 font-mono text-xs">
				{text}
			</Text>
			<Button variant="ghost" size="icon" accessibilityLabel={isCopied ? `${label}, copied` : label} onPress={onCopy}>
				<Icon as={isCopied ? Check : Copy} className="size-4" />
			</Button>
		</View>
	),
	Divider: () => <View className="my-1 border-t border-separator" />,
}

// a failed preference write never prevents using a provider
function rememberProvider(provider: AiProvider): void {
	void AsyncStorage.setItem(LAST_AI_PROVIDER_KEY, provider).catch(() => undefined)
}

// report clipboard failures instead of claiming the value was copied
async function copyText(text: string): Promise<boolean> {
	try {
		await setStringAsync(text)
		return true
	} catch {
		showClientError("That didn't copy. Touch and hold the text to copy it.")
		return false
	}
}
