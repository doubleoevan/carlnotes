// the mobile app's elements for the shared reaction row and comment thread
import { toProfilePath } from "@carlnotes/contracts/seo"
import type { TextComposerElementProps } from "@carlnotes/core/components/TextComposer"
import type { CommentElements, ComposerShareSwitchProps, SocialElements } from "@carlnotes/core/lib/socialElements"
import {
	CARL_AUTHOR_LABEL,
	COMMENT_THREAD_LABELS,
	toChapterLabel,
	toChapterOptions,
	toChapterPosition,
	toChapterValue,
} from "@carlnotes/core/lib/socialLabels"
import { cn } from "@carlnotes/nightshift/classNames"
import { ICON_ACTION_CLASS } from "@carlnotes/nightshift/iconAction"
import { BottomSheetTextInput } from "@gorhom/bottom-sheet"
import { Flag, Flame, type LucideIcon, Pencil, Reply, Trash2 } from "lucide-react-native"
import type { ComponentType } from "react"
import { Alert, Pressable, type TextInputProps, View } from "react-native"
import { toActiveIconProps } from "@/activeIconProps"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { ShareMugsIcon } from "@/components/branding/ShareMugsIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ChoiceSelect } from "@/components/common/ChoiceSelect"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { ScrollBox } from "@/components/common/ScrollBox"
import { Sheet } from "@/components/common/Sheet"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { MoreButton } from "@/components/topic/MoreButton"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { ReactionOption, ROW_CONTROL_HEIGHT } from "./ReactionOption"

// each row control's icon
const ROW_CONTROL_ICONS: Record<"edit" | "delete", LucideIcon> = { edit: Pencil, delete: Trash2 }

// the comment parts that the note thread and the comment thread share
export const COMMENT_ELEMENTS: CommentElements = {
	Message: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	List: ({ children }) => <View className="gap-3">{children}</View>,
	Row: ({ children }) => <View className="gap-1">{children}</View>,
	Age: ({ children }) => <Text className="text-xs text-muted-foreground">{children}</Text>,
	Body: ({ isScrolling, children }) => {
		const body = (
			<Text selectable className="text-sm">
				{children}
			</Text>
		)
		return isScrolling ? <ScrollBox maxHeight={160}>{body}</ScrollBox> : body
	},
	Composer: SocialComposer,
}

// the mobile app's elements. the composer opens in a bottom sheet, which keeps it above the keyboard
export const SOCIAL_ELEMENTS: SocialElements = {
	...COMMENT_ELEMENTS,
	Container: ({ children }) => (
		<View className="gap-3 rounded-lg border border-separator bg-card p-5 shadow-raised">{children}</View>
	),
	Loading: () => <CoffeeLoading className="justify-start py-2" isSmall />,
	Header: ({ children }) => <View className="flex-row flex-wrap items-center gap-2">{children}</View>,
	Author: ({ author }) =>
		author ? <UserProfileLink user={author} /> : <Text className="text-sm font-semibold">{CARL_AUTHOR_LABEL}</Text>,
	Replies: ({ children }) => <View className="mt-2 ml-4 gap-3 border-l border-separator pl-3">{children}</View>,
	// a phone has no hover, so the flame's label is its accessibility label, and a press that cannot share does nothing
	ShareToggle: ({ label, isShared, isAired, isDisabled, onPress }) => (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ selected: isShared, disabled: isDisabled || !onPress }}
			hitSlop={toTouchTargetHitSlop(ROW_CONTROL_HEIGHT)}
			disabled={!isDisabled && !onPress}
			onPress={isDisabled ? () => Alert.alert(label) : onPress}
			className={cn(
				"h-8 items-center justify-center rounded-md active:opacity-75",
				ICON_ACTION_CLASS,
				isDisabled && "opacity-50",
			)}
		>
			{isAired ? (
				<ShareMugsIcon />
			) : (
				<Icon as={Flame} {...toActiveIconProps(isShared, "size-4 text-muted-foreground")} fillOpacity={0.35} />
			)}
		</Pressable>
	),
	Controls: ({ children }) => <View className="-ml-1 flex-row flex-wrap items-center">{children}</View>,
	// a phone has no hover, so a press on a disabled action shows why
	RowControl: ({ kind, label, disabledReason, onPress }) => (
		<Button
			accessibilityLabel={label}
			accessibilityHint={disabledReason}
			accessibilityState={{ disabled: Boolean(disabledReason) }}
			variant="ghost"
			size="icon"
			className={cn("h-8 w-6", disabledReason && "opacity-50")}
			onPress={disabledReason ? () => Alert.alert(disabledReason) : onPress}
		>
			<Icon as={ROW_CONTROL_ICONS[kind]} className="size-4 text-muted-foreground" />
		</Button>
	),
	ReplyButton: ({ label, onPress }) => (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			hitSlop={toTouchTargetHitSlop(ROW_CONTROL_HEIGHT)}
			onPress={onPress}
			className={cn("h-8 shrink-0 flex-row items-center gap-1 active:opacity-75", ICON_ACTION_CLASS)}
		>
			<Icon as={Reply} className="size-4 text-muted-foreground" />
			<Text className="text-xs text-muted-foreground">{label}</Text>
		</Pressable>
	),
	Report: ({ label, isReported, onPress }) => (
		<Button accessibilityLabel={label} variant="ghost" size="icon" className="h-8 w-6" onPress={onPress}>
			<Icon as={Flag} {...toActiveIconProps(isReported, "size-4 text-muted-foreground")} />
		</Button>
	),
	More: ({ label, onPress }) => (
		<Button accessibilityLabel={label} variant="link" size="sm" className="self-start" onPress={onPress}>
			<Text>{label}</Text>
		</Button>
	),
	MoreToggle: MoreButton,
	ComposerRow: ({ children }) => <View className="flex-row items-center justify-between gap-3">{children}</View>,
	// a phone has no hover, so a press shows the tooltip's words
	SharedCommentSlotsLabel: ({ tooltip, children }) => (
		<Pressable
			accessibilityRole="button"
			accessibilityHint={tooltip}
			onPress={() => Alert.alert(tooltip)}
			className="min-w-0 shrink flex-row items-center gap-1.5 active:opacity-75"
		>
			<ShareMugsIcon />
			<Text className="min-w-0 shrink text-right text-sm font-semibold text-badge">{children}</Text>
		</Pressable>
	),
	ComposerButton: ({ label, onPress }) => (
		<Button accessibilityLabel={label} size="sm" onPress={onPress}>
			<Text>{label}</Text>
		</Button>
	),
	Confirm: ConfirmDialog,
	ComposerFrame: ({ title, onClose, children }) => (
		<Sheet title={title} onClose={onClose}>
			<View className="gap-3">{children}</View>
		</Sheet>
	),
	ComposerShareSwitch: SocialComposerShareSwitch,
	ReactionGroup: ({ children }) => <View className="-ml-1 flex-row flex-wrap items-center">{children}</View>,
	ReactionOption,
	Mention: ({ userId, children }) => (
		<AnchorLink asChild href={toProfilePath(userId)} accessibilityLabel={`Open ${String(children)}'s profile`}>
			<Text className="text-sm font-medium text-link">{children}</Text>
		</AnchorLink>
	),
	ChapterTag: ({ chapter, onPress }) => {
		const label = toChapterLabel(chapter)
		return (
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`Play from ${label}`}
				hitSlop={toTouchTargetHitSlop(20)}
				onPress={onPress}
				className="max-w-full rounded-full bg-muted px-2 py-0.5 active:opacity-75"
			>
				<Text numberOfLines={1} className="text-xs text-muted-foreground">
					{label}
				</Text>
			</Pressable>
		)
	},
	ChapterSelect: ({ chapters, chapterPosition, onChange }) => (
		<ChoiceSelect
			label={COMMENT_THREAD_LABELS.chapter}
			presentation="sheet"
			numberOfLines={1}
			value={toChapterValue(chapterPosition)}
			options={toChapterOptions(chapters)}
			onChange={(value) => onChange(toChapterPosition(value))}
		/>
	),
}

// the switch at the composer's bottom left, labelled in the app's own text
function SocialComposerShareSwitch({ label, isChecked, disabledReason, onChange }: ComposerShareSwitchProps) {
	return (
		<Pressable
			accessibilityHint={disabledReason}
			disabled={!disabledReason}
			onPress={() => disabledReason && Alert.alert(disabledReason)}
			className="shrink flex-row items-center gap-2"
		>
			<PreferenceSwitch label={label} isChecked={isChecked} isDisabled={Boolean(disabledReason)} onChange={onChange} />
			<Text className="shrink text-sm text-muted-foreground">{label}</Text>
		</Pressable>
	)
}

/**
 * The composer inside a sheet: the text box, the users a trailing mention suggests, Carl's words about a rejected text,
 * and the submit. A composer outside a sheet passes its own text input.
 */
export function SocialComposer({
	value,
	onChange,
	onSubmit,
	isPending,
	canSubmit,
	maxLength,
	placeholder,
	inputLabel = placeholder,
	submitLabel,
	submitAccessibilityLabel = submitLabel,
	isAutoFocused,
	message,
	suggestions = [],
	onPickSuggestion,
	footerStart,
	Input = BottomSheetTextInput,
}: TextComposerElementProps & { Input?: ComponentType<TextInputProps> }) {
	return (
		<View className="gap-2">
			<Input
				autoFocus={isAutoFocused}
				accessibilityLabel={inputLabel}
				value={value}
				onChangeText={onChange}
				multiline
				placeholder={placeholder}
				maxLength={maxLength}
				style={toTypeRoleStyle("bodyLarge")}
				textAlignVertical="top"
				className="min-h-16 rounded-md border border-input bg-card px-3 py-2 text-foreground"
			/>

			{/* the users the trailing mention suggests */}
			{suggestions.length > 0 && (
				<View className="flex-row flex-wrap gap-1" accessibilityLabel={COMMENT_THREAD_LABELS.mentionSuggestions}>
					{suggestions.map((user) => (
						<Button
							key={user.userId}
							accessibilityLabel={`Mention ${user.username}`}
							variant="outline"
							size="sm"
							onPress={() => onPickSuggestion?.(user)}
						>
							<Text>{`@${user.username}`}</Text>
						</Button>
					))}
				</View>
			)}
			{message && (
				<Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="text-sm text-destructive">
					{message}
				</Text>
			)}
			<View className="flex-row items-center justify-between gap-2">
				{footerStart}
				<Button
					accessibilityLabel={submitAccessibilityLabel}
					size="sm"
					className="ml-auto"
					onPress={onSubmit}
					disabled={!canSubmit || isPending}
				>
					<Text>{submitLabel}</Text>
				</Button>
			</View>
		</View>
	)
}
