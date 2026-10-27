import { colors } from "@carlnotes/nightshift/colors"
import { Switch, View } from "react-native"
import { useUniwind } from "uniwind"

/**
 * Gives the native switch Nightshift's orange selected state and a platform-sized touch target.
 */
export function PreferenceSwitch({
	label,
	isChecked,
	isDisabled = false,
	onChange,
}: {
	label: string
	isChecked: boolean
	isDisabled?: boolean
	onChange: (isChecked: boolean) => void
}) {
	const { theme } = useUniwind()
	const mode = theme === "dark" ? "dark" : "light"
	return (
		<View className="min-h-12 justify-center">
			<Switch
				accessibilityLabel={label}
				value={isChecked}
				disabled={isDisabled}
				onValueChange={onChange}
				trackColor={{ false: colors.input[mode], true: colors.primary[mode] }}
				thumbColor={colors.card[mode]}
			/>
		</View>
	)
}
