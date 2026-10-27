import type { LucideIcon } from "lucide-react-native"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Icon } from "@/components/primitives/icon"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Text } from "@/components/primitives/text"

/**
 * Adapts a compact web choice to the native anchored Nightshift dropdown.
 */
export function ChoiceSelect({
	label,
	value,
	options,
	isDisabled,
	onChange,
}: {
	label: string
	value: string
	options: { value: string; label: string; icon?: LucideIcon }[]
	isDisabled?: boolean
	onChange: (value: string) => void
}) {
	// resolve the selected option and keep its menu inside the safe area
	const insets = useSafeAreaInsets()
	const selectedOption = options.find((option) => option.value === value)
	return (
		<Select
			value={selectedOption}
			onValueChange={(option) => {
				if (option) {
					onChange(option.value)
				}
			}}
			disabled={isDisabled}
		>
			<SelectTrigger accessibilityLabel={label} className="min-w-0 px-2">
				{selectedOption?.icon ? (
					<View className="flex-row items-center gap-2">
						<Icon as={selectedOption.icon} className="size-4 text-muted-foreground" />
						<Text className="text-sm">{selectedOption.label}</Text>
					</View>
				) : (
					<SelectValue placeholder={label} />
				)}
			</SelectTrigger>
			<SelectContent insets={insets} className="min-w-48">
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value} label={option.label} accessibilityLabel={option.label}>
						{option.icon ? (
							<>
								<Icon as={option.icon} className="size-4 text-muted-foreground" />
								<Text className="flex-1 text-sm">{option.label}</Text>
							</>
						) : undefined}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}
