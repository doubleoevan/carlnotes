import {
	type PlanCardElements,
	type PlanCardProps,
	PlanCard as SharedPlanCard,
} from "@carlnotes/core/components/PlanCard"
import { cn } from "@carlnotes/nightshift/classNames"
import { Check } from "lucide-react-native"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

/**
 * Renders the shared plan card in native Nightshift controls.
 */
export function PlanCard(props: PlanCardProps) {
	return <SharedPlanCard {...props} elements={PLAN_CARD_ELEMENTS} />
}

// translate layout to native views while retaining the web's type, spacing, and button colors
const PLAN_CARD_ELEMENTS: PlanCardElements = {
	Card: ({ children, isHighlighted }) => (
		<View
			className={cn(
				"relative rounded-xl border border-border bg-card p-6 shadow-raised",
				isHighlighted && "border-primary",
			)}
		>
			{children}
		</View>
	),
	Badge: ({ children }) => (
		<View className="absolute -top-3 self-center rounded-full bg-primary px-3 py-0.5">
			<Text className="text-xs font-semibold text-primary-foreground">{children}</Text>
		</View>
	),
	Title: ({ children }) => (
		<Text accessibilityRole="header" className="font-display text-lg capitalize">
			{children}
		</Text>
	),
	Tagline: ({ children }) => <Text className="mt-1 text-sm text-muted-foreground">{children}</Text>,
	Price: ({ price, billingNote }) => (
		<>
			<View className="mt-4 flex-row items-baseline">
				<Text className="text-3xl font-bold">{price}</Text>
				<Text className="text-sm text-muted-foreground"> /month</Text>
			</View>
			<Text className="mt-1 text-xs text-muted-foreground">{billingNote}</Text>
		</>
	),
	Quotas: ({ children }) => <View className="mt-4 gap-2">{children}</View>,
	Quota: ({ label, isRaised }) => (
		<View className="flex-row items-start gap-2">
			<Icon as={Check} className="mt-0.5 size-4 text-primary" />
			<Text className="flex-1 text-sm">
				{label}
				{isRaised && <Text className="text-xs font-semibold text-link"> with Yearly plan</Text>}
			</Text>
		</View>
	),
	Action: ({ label, isDisabled, isOutlined, onPress }) => (
		<Button
			variant={isOutlined ? "outline" : "default"}
			accessibilityLabel={label}
			disabled={isDisabled}
			onPress={onPress}
			className="mt-6 w-full"
		>
			<Text>{label}</Text>
		</Button>
	),
}
