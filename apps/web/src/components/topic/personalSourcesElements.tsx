import type { TopicPersonalSourcesElements } from "@carlnotes/core/components/TopicPersonalSources"
import type { PersonalSourceConversationProvider } from "@carlnotes/core/lib/personalSourcesCopy"
import {
	toPersonalSourceConversationLabel,
	toPersonalSourceConversationProvider,
} from "@carlnotes/core/lib/personalSourcesCopy"
import { cn } from "@carlnotes/nightshift/classNames"
import { ExternalLink, Mail, MessageCircle } from "lucide-react"
import type { ComponentProps } from "react"
import { ACCOUNT_FIELD_ELEMENTS } from "@/components/account/AccountFields"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { BrandIcon } from "@/components/common/BrandIcon"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Pagination } from "@/components/common/Pagination"
import { Button } from "@/components/primitives/button"
import { ExpandableRow } from "@/components/primitives/expandable-row"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { PersonalSourceLink } from "./PersonalSourceLink"
import { TopicSource } from "./TopicSource"

// the browser personal sources and its stories use the same Nightshift adapters
export const PERSONAL_SOURCES_ELEMENTS: TopicPersonalSourcesElements = {
	...ACCOUNT_FIELD_ELEMENTS,
	ExpandableRow,
	Sender: SenderMetadata,
	PersonalSourceLink,
	Pagination: (props) => <Pagination {...props} ariaLabel="Personal sources pages" />,
	Loading: () => <CoffeeLoading className="min-h-0 justify-start py-2 text-xs" />,
	Row: ({ children, className }) => (
		<div className={`ph-no-capture ${className ?? ""}`} data-private>
			{children}
		</div>
	),
	Group: ({ children }) => (
		<div className="ph-no-capture mt-3 min-w-0 space-y-3" data-private>
			{children}
		</div>
	),
	Button: ({ label, onPress, isDisabled, isExpanded, isDestructive, accessibilityLabel }) => (
		<Button
			type="button"
			variant={isDestructive ? "destructive" : "outline"}
			size="sm"
			onClick={onPress}
			disabled={isDisabled}
			aria-expanded={isExpanded}
			aria-label={accessibilityLabel}
			className={cn(
				"h-auto min-h-8 max-w-full whitespace-normal break-words py-1.5 text-left",
				!isDestructive && "text-foreground hover:text-foreground",
			)}
		>
			{label}
		</Button>
	),
	Confirm: ConfirmDialog,
	Source: TopicSource,
	Secret: ({ children }) => (
		<code className="ph-no-capture block break-all rounded border border-separator p-3 text-sm" data-private>
			{children}
		</code>
	),
	Link: ({ href, children, onPress }) => (
		<AnchorLink
			onClick={onPress}
			href={href}
			isUserContent
			className="sentence-link flex min-w-0 items-center gap-1 text-sm"
		>
			<span className="min-w-0 break-words">{children}</span>
		</AnchorLink>
	),
}

// keep authenticated sender marks and conversation marks consistent
function ProviderMark({ provider }: { provider: PersonalSourceConversationProvider }) {
	return provider !== "other" ? (
		<BrandIcon brand={provider} className="size-3 shrink-0" />
	) : (
		<MessageCircle aria-hidden className="size-3 shrink-0" />
	)
}

// link the complete conversation metadata when the sender supplied a real reference
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
				isUserContent
				className={`${STANDALONE_LINK_CLASS} inline-flex min-w-0 flex-wrap items-center gap-1 text-sm underline underline-offset-2`}
				aria-label={toPersonalSourceConversationLabel(toPersonalSourceConversationProvider(chatUrl))}
			>
				<span>{date} ·</span>
				<span className="break-words">{label}</span>
				<ProviderMark provider={provider} />
				<ExternalLink aria-hidden className="size-3 shrink-0" />
			</AnchorLink>
		)
	}
	return (
		<div className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground">
			<span>{date} ·</span>
			{kind === "email" ? <Mail aria-hidden className="size-3 shrink-0" /> : <ProviderMark provider={provider} />}
			<span className="break-words">{label}</span>
		</div>
	)
}
