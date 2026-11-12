import { cn } from "@carlnotes/nightshift/classNames"
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
	isHighlighted,
	isTriggerIconShown = true,
	onChange,
	onOpen,
}: {
	label: string
	value: string
	// each choice's value, label, icon, a count badge beside its label, and the lines its label keeps to, in the list
	// and as the selected choice
	options: {
		value: string
		label: string
		icon?: LucideIcon | ReactElement
		badge?: ReactElement
		numberOfLines?: number
	}[]
	isDisabled?: boolean
	presentation?: "dropdown" | "sheet"
	numberOfLines?: number
	// whether the dropdown's trigger takes the primary fill, as a page's highlighted button
	isHighlighted?: boolean
	// whether the trigger shows the selected choice's icon beside its label, or the label alone
	isTriggerIconShown?: boolean
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
	const triggerIcon = isTriggerIconShown ? selectedOption?.icon : undefined
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
						icon={triggerIcon}
						badge={selectedOption?.badge}
						numberOfLines={numberOfLines ?? selectedOption?.numberOfLines}
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
				className={cn("min-w-0 px-2", isHighlighted && "border-transparent bg-primary")}
				iconClassName={isHighlighted ? "text-primary-foreground" : undefined}
				onLayout={(event) => setTriggerWidth(event.nativeEvent.layout.width)}
			>
				{selectedOption && triggerIcon ? (
					<ChoiceLabel {...selectedOption} numberOfLines={numberOfLines ?? selectedOption.numberOfLines} />
				) : (
					<SelectValue placeholder={label} className={isHighlighted ? "text-primary-foreground" : undefined} />
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
