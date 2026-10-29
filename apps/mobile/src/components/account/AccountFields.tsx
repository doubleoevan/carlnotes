import type { AccountFieldElements, ProfileFieldElements } from "@carlnotes/core/components/AccountFields"
import type { BlockedUsersElements } from "@carlnotes/core/components/BlockedUsersSection"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { cn } from "@carlnotes/nightshift/classNames"
import { Check, Info } from "lucide-react-native"
import { Alert, Pressable, View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SessionTextInput } from "@/components/session/SessionTextInput"

// native controls render the web's shared account forms without changing their content
export const ACCOUNT_FIELD_ELEMENTS: AccountFieldElements = {
	Card: ({ children }) => (
		<View className="rounded-lg border border-separator bg-card p-4 shadow-raised">{children}</View>
	),
	Group: ({ children }) => <View className="mt-3 gap-3">{children}</View>,
	Form: ({ children }) => <View className="mt-3 gap-3">{children}</View>,
	Heading: ({ children }) => (
		<Text accessibilityRole="header" className="font-semibold">
			{children}
		</Text>
	),
	Text: Text,
	Field: ({ label, value, onChange, kind }) => (
		<SessionTextInput
			label={label}
			value={value}
			onChangeText={onChange}
			secureTextEntry={kind !== "email"}
			keyboardType={kind === "email" ? "email-address" : "default"}
			autoComplete={kind}
		/>
	),
	Button: ({ label, onPress, isDisabled }) => (
		<Button accessibilityLabel={label} onPress={onPress} disabled={isDisabled} className="self-start">
			<Text>{label}</Text>
		</Button>
	),
	Choice: ({ label, description, isSelected, isDisabled, onSelect }) => (
		<View className="flex-row items-center gap-2">
			<Pressable
				accessibilityRole="radio"
				accessibilityState={{ checked: isSelected }}
				accessibilityLabel={label}
				onPress={onSelect}
				disabled={isDisabled}
				className="min-h-11 flex-1 flex-row items-center gap-2 rounded-md active:bg-accent"
			>
				<View className="size-5 items-center justify-center rounded-full border border-primary">
					{isSelected && <Icon as={Check} className="size-3 text-primary" />}
				</View>
				<Text>{label}</Text>
			</Pressable>
			{description && (
				<Button
					variant="ghost"
					size="icon"
					accessibilityLabel="What counts as interacting"
					onPress={() => Alert.alert("People I interact with", description)}
				>
					<Icon as={Info} className="size-4 text-primary" />
				</Button>
			)}
		</View>
	),
}

// the blocked people section's rows around the shared account elements
export const BLOCKED_USERS_ELEMENTS: BlockedUsersElements = {
	Card: ACCOUNT_FIELD_ELEMENTS.Card,
	Group: ACCOUNT_FIELD_ELEMENTS.Group,
	Heading: ACCOUNT_FIELD_ELEMENTS.Heading,
	Text: ACCOUNT_FIELD_ELEMENTS.Text,
	Button: ({ label, onPress, isDisabled }) => (
		<Button variant="outline" size="sm" accessibilityLabel={label} onPress={onPress} disabled={isDisabled}>
			<Text>{label}</Text>
		</Button>
	),
	Row: ({ children }) => <View className="flex-row items-center justify-between gap-3">{children}</View>,
	Username: ({ userId, username }) => (
		<AnchorLink
			href={`${SITE_URL}/profiles/${userId}`}
			accessibilityLabel={`Open ${username}'s profile`}
			className="min-h-6 shrink"
		>
			<Text className="shrink text-sm font-semibold text-link">{username}</Text>
		</AnchorLink>
	),
}

// keep the native profile controls around the shared identity and username form
export const PROFILE_FIELD_ELEMENTS: ProfileFieldElements = {
	Root: ({ children, className }) => <View className={cn("gap-3", className)}>{children}</View>,
	Identity: ({ avatar, children }) => (
		<>
			{avatar}
			{children}
		</>
	),
	Text: Text,
	ProviderPhoto: ({ label, isSelected, onSelect }) => (
		<View className="flex-row items-center gap-3">
			<PreferenceSwitch label={label} isChecked={isSelected} onChange={onSelect} />
			<Text className="flex-1">{label}</Text>
		</View>
	),
	Form: ({ children }) => <View className="gap-3">{children}</View>,
	Field: ({ label, value, onChange, placeholder }) => (
		<SessionTextInput label={label} value={value} onChangeText={onChange} placeholder={placeholder} />
	),
	Rejection: ({ children }) => (
		<Text accessibilityRole="alert" className="text-sm text-destructive">
			{children}
		</Text>
	),
	Button: ACCOUNT_FIELD_ELEMENTS.Button,
}
