import {
	type ExpandableRowElements,
	type ExpandableRowProps,
	ExpandableRow as SharedExpandableRow,
} from "@carlnotes/core/components/ExpandableRow"
import { cn } from "@carlnotes/nightshift/classNames"
import { expandableRowClasses } from "@carlnotes/nightshift/components/expandable-row"
import { ChevronDown, ChevronUp } from "lucide-react-native"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { toTypeRoleStyle } from "@/typeRoleStyles"

// adapt the shared disclosure to native accessibility and minimum touch targets
const ELEMENTS: ExpandableRowElements = {
	Title: ({ children, className, isSection }) => (
		<Text className={className} style={isSection ? toTypeRoleStyle("sectionLabel") : undefined}>
			{children}
		</Text>
	),
	Text: ({ children, className }) => <Text className={cn(className, "no-underline")}>{children}</Text>,
	Row: ({ children, className }) => <View className={className}>{children}</View>,
	Disclosure: ({ children, label, isExpanded, onPress }) => (
		<Button
			variant="link"
			accessibilityLabel={label}
			accessibilityState={{ expanded: isExpanded }}
			onPress={onPress}
			className={cn(expandableRowClasses.trigger, "min-h-12")}
		>
			{children}
		</Button>
	),
	Details: ({ id, children, className }) => (
		<View nativeID={id} className={cn(className, "gap-3")}>
			{children}
		</View>
	),
	Chevron: ({ isExpanded }) => (
		<Icon as={isExpanded ? ChevronUp : ChevronDown} className={expandableRowClasses.chevron} />
	),
}

/**
 * Renders the shared row with native accessibility and touch targets.
 */
export function ExpandableRow(props: ExpandableRowProps) {
	return <SharedExpandableRow {...props} elements={ELEMENTS} />
}
