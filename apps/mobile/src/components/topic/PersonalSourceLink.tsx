import {
	type PersonalSourceLinkElements,
	type PersonalSourceLinkProps,
	PersonalSourceLink as SharedPersonalSourceLink,
} from "@carlnotes/core/components/PersonalSourceLink"
import { TOPIC_FINDING_NOTE_TOOLTIP } from "@carlnotes/core/lib/topicFindingCopy"
import { ExternalLink } from "lucide-react-native"
import { type ComponentRef, createContext, type RefObject, useContext, useRef } from "react"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button, toButtonHeight, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TopicResourceInfo } from "./TopicResourceInfo"

// keep link selection shared while native controls provide browser and sheet presentation
const ELEMENTS: PersonalSourceLinkElements = {
	Row: ({ children }) => <View className="min-w-0 flex-row items-center gap-2">{children}</View>,
	SourceLink: ({ url, label }) => (
		<AnchorLink
			href={url}
			accessibilityLabel={`Open ${label} in browser`}
			hitSlop={toTouchTargetHitSlop(toButtonHeight("sm"))}
			className="min-h-8 min-w-0 shrink flex-row items-center gap-1"
		>
			<Text numberOfLines={1} ellipsizeMode="tail" className="shrink text-sm text-link underline">
				{label}
			</Text>
			<Icon as={ExternalLink} className="size-3 shrink-0 text-link" />
		</AnchorLink>
	),
	Pending: ({ children }) => (
		<Text className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
			{children}
		</Text>
	),
	FindingFrame,
	FindingDetails: ({ topic, resource, topicFeedHandlers, onClose }) => {
		const triggerRef = useContext(FindingTriggerContext)
		return (
			<TopicResourceInfo
				topic={topic}
				resource={resource}
				topicFeedHandlers={topicFeedHandlers}
				onClose={onClose}
				triggerRef={triggerRef}
			/>
		)
	},
}

/**
 * Adapts source links to the browser or the existing Finding sheet.
 */
export function PersonalSourceLink(props: PersonalSourceLinkProps) {
	return <SharedPersonalSourceLink {...props} elements={ELEMENTS} />
}

// return screen-reader focus to the source link when the stacked Finding sheet closes
const FindingTriggerContext = createContext<RefObject<ComponentRef<typeof View> | null> | undefined>(undefined)
function FindingFrame({
	label,
	isOpen,
	onOpenChange,
	children,
}: React.ComponentProps<PersonalSourceLinkElements["FindingFrame"]>) {
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	return (
		<FindingTriggerContext.Provider value={triggerRef}>
			<Button
				ref={triggerRef}
				variant="link"
				size="sm"
				accessibilityLabel={label}
				accessibilityHint={TOPIC_FINDING_NOTE_TOOLTIP}
				accessibilityState={{ expanded: isOpen }}
				className="min-h-8 max-w-full self-start p-0"
				onPress={() => onOpenChange(true)}
			>
				<Text numberOfLines={1} ellipsizeMode="tail" className="shrink text-sm text-link underline">
					{label}
				</Text>
			</Button>
			{children}
		</FindingTriggerContext.Provider>
	)
}
