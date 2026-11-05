import type { TopicPersonalSourcesElements } from "@carlnotes/core/components/TopicPersonalSources"
import type { PersonalSourceConversationProvider } from "@carlnotes/core/lib/personalSourcesCopy"
import {
	toPersonalSourceConversationLabel,
	toPersonalSourceConversationProvider,
} from "@carlnotes/core/lib/personalSourcesCopy"
import { AI_PROVIDER_ICON_PATHS } from "@carlnotes/nightshift/aiProviderIcons"
import { ExternalLink, Mail, MessageCircle } from "lucide-react-native"
import type { ComponentProps } from "react"
import { View } from "react-native"
import { Path } from "react-native-svg"
import { ACCOUNT_FIELD_ELEMENTS } from "@/components/account/AccountFields"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ClassNameSvg } from "@/components/common/ClassNameSvg"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Pagination } from "@/components/common/Pagination"
import { Button, toButtonHeight, toTouchTargetHitSlop } from "@/components/primitives/button"
import { ExpandableRow } from "@/components/primitives/expandable-row"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { PersonalSourceLink } from "./PersonalSourceLink"
import { TopicSource } from "./TopicSource"

// native controls retain the browser's order while adapting links and text selection
export const PERSONAL_SOURCES_ELEMENTS: TopicPersonalSourcesElements = {
	...ACCOUNT_FIELD_ELEMENTS,
	ExpandableRow,
	Sender: SenderMetadata,
	PersonalSourceLink,
	Pagination: (props) => <Pagination {...props} label="Personal sources pages" />,
	Loading: () => <CoffeeLoading className="justify-start py-2" isSmall />,
	Row: ({ children, className }) => <View className={className}>{children}</View>,
	Group: ({ children }) => <View className="mt-3 min-w-0 gap-3">{children}</View>,
	Button: ({ label, onPress, isDisabled, isExpanded, isDestructive, accessibilityLabel }) => (
		<Button
			variant={isDestructive ? "destructive" : "outline"}
			size="sm"
			accessibilityLabel={accessibilityLabel ?? label}
			accessibilityState={{ expanded: isExpanded, disabled: isDisabled }}
			onPress={onPress}
			disabled={isDisabled}
			className="h-auto min-h-8 max-w-full self-start py-1.5"
		>
			<Text className="shrink">{label}</Text>
		</Button>
	),
	Confirm: ConfirmDialog,
	Source: TopicSource,
	Secret: ({ children }) => (
		<Text selectable className="rounded border border-separator p-3 text-sm">
			{children}
		</Text>
	),
	Link: ({ href, children, onPress }) => (
		<AnchorLink
			href={href}
			onPress={onPress}
			accessibilityLabel={typeof children === "string" ? children : "Open personal sources reference"}
			hitSlop={toTouchTargetHitSlop(toButtonHeight("sm"))}
			className="min-h-8 min-w-0 flex-row items-center gap-1 self-start"
		>
			<Text className="shrink text-sm text-link">{children}</Text>
		</AnchorLink>
	),
}

// draw shared Nightshift paths with native SVG
function ProviderMark({
	provider,
	isMuted = false,
}: {
	provider: PersonalSourceConversationProvider
	isMuted?: boolean
}) {
	const paths = provider === "other" ? null : AI_PROVIDER_ICON_PATHS[provider]
	const colorClass = isMuted ? "text-muted-foreground" : "text-link"
	if (!paths) {
		return <Icon as={MessageCircle} className={`size-3 ${colorClass}`} />
	}
	return (
		<ClassNameSvg width={12} height={12} viewBox="0 0 24 24" className={colorClass} accessible={false}>
			{paths.map((path) => (
				<Path key={path} d={path} fill="currentColor" fillRule="evenodd" />
			))}
		</ClassNameSvg>
	)
}

// open the whole metadata row through the platform's external-link adapter
function SenderMetadata({
	date,
	label,
	kind,
	provider,
	chatUrl,
}: ComponentProps<TopicPersonalSourcesElements["Sender"]>) {
	if (chatUrl && kind !== "email") {
		return (
			<AnchorLink
				href={chatUrl}
				accessibilityLabel={toPersonalSourceConversationLabel(toPersonalSourceConversationProvider(chatUrl))}
				hitSlop={toTouchTargetHitSlop(toButtonHeight("sm"))}
				className="min-w-0 flex-row flex-wrap items-center gap-1 self-start"
			>
				<Text className="text-sm text-link underline">{date} ·</Text>
				<Text className="shrink text-sm text-link underline">{label}</Text>
				<ProviderMark provider={provider} />
				<Icon as={ExternalLink} className="size-3 text-link" />
			</AnchorLink>
		)
	}
	return (
		<View className="min-w-0 flex-row flex-wrap items-center gap-1">
			<Text className="text-sm text-muted-foreground">{date} ·</Text>
			{kind === "email" ? (
				<Icon as={Mail} className="size-3 text-muted-foreground" />
			) : (
				<ProviderMark provider={provider} isMuted />
			)}
			<Text className="shrink text-sm text-muted-foreground">{label}</Text>
		</View>
	)
}
