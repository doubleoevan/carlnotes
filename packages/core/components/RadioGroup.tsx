// a row of choices of which exactly one is on. each app supplies the group and the option buttons
import type { ComponentType, ReactNode } from "react"
import type { DashboardChoice } from "../lib/dashboardCharts"

// each app's elements: the group that names the choice for assistive tech, and one option's button
export type RadioGroupElements = {
	Group: ComponentType<{ label: string; children: ReactNode }>
	Option: ComponentType<{ label: string; isSelected: boolean; onSelect: () => void }>
}

// the group's name, the choice that is on, every choice, and what choosing one does
export type RadioGroupProps<Value extends string> = {
	label: string
	value: Value
	choices: DashboardChoice<Value>[]
	onChange: (value: Value) => void
}

/**
 * Shows every choice as an option, with the chosen one on. Choosing the one already on changes nothing.
 */
export function RadioGroup<Value extends string>({
	label,
	value,
	choices,
	onChange,
	elements: { Group, Option },
}: RadioGroupProps<Value> & { elements: RadioGroupElements }) {
	return (
		<Group label={label}>
			{choices.map((choice) => (
				<Option
					key={choice.value}
					label={choice.label}
					isSelected={choice.value === value}
					onSelect={() => choice.value !== value && onChange(choice.value)}
				/>
			))}
		</Group>
	)
}
