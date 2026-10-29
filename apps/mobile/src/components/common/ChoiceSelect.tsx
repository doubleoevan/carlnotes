import { Check, ChevronDown, type LucideIcon } from "lucide-react-native"
import { type ComponentRef, isValidElement, type ReactElement, useRef, useState } from "react"
import { useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Text } from "@/components/primitives/text"
import { Sheet } from "./Sheet"

/**
 * Adapts a web choice to a native dropdown or full-width sheet.
 */
export function ChoiceSelect({
	label,
	value,
	options,
	isDisabled,
	presentation = "dropdown",
	numberOfLines,
	onChange,
	onOpen,
}: {
	label: string
	value: string
	// each choice's value, label, icon, and a count badge beside its label
	options: { value: string; label: string; icon?: LucideIcon | ReactElement; badge?: ReactElement }[]
	isDisabled?: boolean
	presentation?: "dropdown" | "sheet"
	numberOfLines?: number
	onChange: (value: string) => void
	// what opening the choice list does besides showing it
	onOpen?: () => void
}) {
	// resolve the selected option and keep its menu inside the safe area
	const insets = useSafeAreaInsets()
	const { width } = useWindowDimensions()
	const [triggerWidth, setTriggerWidth] = useState(0)
	const [isOpen, setIsOpen] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const selectedOption = options.find((option) => option.value === value)
	if (presentation === "sheet") {
		return (
			<>
				{/* retain the selected label while the full-width choice list opens */}
				<Button
					ref={triggerRef}
					variant="outline"
					className="min-h-12 justify-between px-2"
					accessibilityLabel={label}
					accessibilityState={{ expanded: isOpen }}
					disabled={isDisabled}
					onPress={() => {
						onOpen?.()
						setIsOpen(true)
					}}
				>
					<ChoiceLabel
						label={selectedOption?.label ?? label}
						icon={selectedOption?.icon}
						badge={selectedOption?.badge}
						numberOfLines={numberOfLines}
					/>
					<Icon as={ChevronDown} className="size-4 text-muted-foreground" />
				</Button>
				{/* reuse the shared sheet's scrolling, dismissal, safe area, and focus return */}
				{isOpen && (
					<Sheet title={label} triggerRef={triggerRef} onClose={() => setIsOpen(false)} hasHighlightedScrollIndicator>
						{options.map((option) => (
							<Button
								key={option.value}
								variant="ghost"
								className="min-h-12 justify-between px-2 py-3"
								accessibilityLabel={option.label}
								accessibilityState={{ selected: option.value === value }}
								onPress={() => {
									// select the option and close the sheet
									onChange(option.value)
									setIsOpen(false)
								}}
							>
								<ChoiceLabel {...option} />
								{option.value === value && <Icon as={Check} className="size-4 text-primary" />}
							</Button>
						))}
					</Sheet>
				)}
			</>
		)
	}
	return (
		<Select
			value={selectedOption}
			onValueChange={(option) => {
				if (option) {
					onChange(option.value)
				}
			}}
			onOpenChange={(isMenuOpen) => {
				if (isMenuOpen) {
					onOpen?.()
				}
			}}
			disabled={isDisabled}
		>
			<SelectTrigger
				accessibilityLabel={label}
				className="min-w-0 px-2"
				onLayout={(event) => setTriggerWidth(event.nativeEvent.layout.width)}
			>
				{selectedOption?.icon ? (
					<ChoiceLabel {...selectedOption} numberOfLines={numberOfLines} />
				) : (
					<SelectValue placeholder={label} />
				)}
			</SelectTrigger>
			<SelectContent
				insets={insets}
				style={{ width: Math.min(Math.max(192, triggerWidth), width - insets.left - insets.right - 24) }}
			>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value} label={option.label} accessibilityLabel={option.label}>
						{option.icon ? <ChoiceLabel {...option} /> : undefined}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

// keep avatar, icon, label, and badge spacing identical in both choice presentations
function ChoiceLabel({
	label,
	icon,
	badge,
	numberOfLines,
}: {
	label: string
	icon?: LucideIcon | ReactElement
	badge?: ReactElement
	numberOfLines?: number
}) {
	return (
		<View className="min-w-0 shrink flex-row items-center gap-2">
			{icon && (isValidElement(icon) ? icon : <Icon as={icon} className="size-4 text-muted-foreground" />)}
			<Text className="shrink text-left text-sm" numberOfLines={numberOfLines}>
				{label}
			</Text>
			{badge}
		</View>
	)
}
