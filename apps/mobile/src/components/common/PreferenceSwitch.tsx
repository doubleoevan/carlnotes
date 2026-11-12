import { colors } from "@carlnotes/nightshift/colors"
import { Switch, View } from "react-native"
import { useColorMode } from "@/theme"

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
	const colorMode = useColorMode()
	return (
		<View className="min-h-12 justify-center">
			<Switch
				accessibilityLabel={label}
				value={isChecked}
				disabled={isDisabled}
				onValueChange={onChange}
				trackColor={{ false: colors.input[colorMode], true: colors.primary[colorMode] }}
				thumbColor={colors.card[colorMode]}
			/>
		</View>
	)
}
