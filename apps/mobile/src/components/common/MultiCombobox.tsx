import { Check, ChevronDown, Plus, X } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SessionTextInput } from "@/components/session/SessionTextInput"
import { Sheet } from "./Sheet"

/**
 * Adapts the web's searchable multiple choice picker to a native sheet.
 */
export function MultiCombobox({
	label,
	options,
	values,
	onUpdateValues,
	placeholder,
	emptyLabel,
	onNewOption,
	newOptionLabel = "New topic",
}: {
	label: string
	options: { value: string; label: string }[]
	values: string[]
	onUpdateValues: (values: string[]) => void
	placeholder: string
	emptyLabel: string
	onNewOption?: () => void
	newOptionLabel?: string
}) {
	// keep search local to the choice sheet
	const [isOpen, setIsOpen] = useState(false)
	const [search, setSearch] = useState("")
	const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(search.toLowerCase()))
	function handleToggle(value: string): void {
		onUpdateValues(
			values.includes(value) ? values.filter((selectedValue) => selectedValue !== value) : [...values, value],
		)
	}
	return (
		<View className="gap-2">
			<Text className="text-sm font-medium">{label}</Text>
			<Button variant="outline" accessibilityLabel={label} className="justify-between" onPress={() => setIsOpen(true)}>
				<Text className="flex-1 text-left">{values.length ? `${values.length} selected` : placeholder}</Text>
				<Icon as={ChevronDown} className="size-4" />
			</Button>
			<View className="flex-row flex-wrap gap-1.5">
				{values.map((value) => (
					<Button
						key={value}
						variant="secondary"
						size="sm"
						className="rounded-full"
						accessibilityLabel={`Remove ${options.find((option) => option.value === value)?.label ?? value}`}
						onPress={() => handleToggle(value)}
					>
						<Text>{options.find((option) => option.value === value)?.label ?? value}</Text>
						<Icon as={X} className="size-3" />
					</Button>
				))}
			</View>
			{isOpen && (
				<Sheet title={label} onClose={() => setIsOpen(false)}>
					<SessionTextInput label={`Search ${label.toLowerCase()}`} value={search} onChangeText={setSearch} />
					{filteredOptions.map((option) => (
						<Button
							key={option.value}
							variant="ghost"
							className="min-h-12 justify-start"
							accessibilityLabel={option.label}
							accessibilityState={{ selected: values.includes(option.value) }}
							onPress={() => handleToggle(option.value)}
						>
							<Text className="flex-1 text-left">{option.label}</Text>
							{values.includes(option.value) && <Icon as={Check} className="size-4 text-link" />}
						</Button>
					))}
					{!filteredOptions.length && <Text className="text-sm text-muted-foreground">{emptyLabel}</Text>}
					{onNewOption && (
						<Button
							variant="ghost"
							className="justify-start"
							accessibilityLabel={newOptionLabel}
							onPress={() => {
								setIsOpen(false)
								onNewOption()
							}}
						>
							<Icon as={Plus} className="size-4" />
							<Text>{newOptionLabel}</Text>
						</Button>
					)}
				</Sheet>
			)}
		</View>
	)
}
