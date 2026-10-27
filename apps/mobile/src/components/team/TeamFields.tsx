import type { TeamFieldElements } from "@carlnotes/core/components/TeamFields"
import { cn } from "@carlnotes/nightshift/classNames"
import { View } from "react-native"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { Text } from "@/components/primitives/text"
import { SessionTextInput } from "@/components/session/SessionTextInput"

// native controls adapt the same form content and field order
export const TEAM_FIELD_ELEMENTS: TeamFieldElements = {
	Group: View,
	InvitationGroup: ({ children }) => <View className="gap-3 border-t border-separator pt-3">{children}</View>,
	Text: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	Field: ({ label, value, onChange, placeholder, isMultiline, onBlur, hasError }) => (
		<SessionTextInput
			label={label}
			value={value}
			onChangeText={onChange}
			placeholder={placeholder}
			multiline={isMultiline}
			onBlur={onBlur}
			className={cn(isMultiline && "min-h-24", hasError && "border-destructive")}
		/>
	),
	PublicChoice: ({ isPublic, onChange }) => (
		<View className="flex-row items-center gap-2">
			<PreferenceSwitch label="Public" isChecked={isPublic} onChange={onChange} />
			<Text className="text-sm">Public</Text>
		</View>
	),
}
