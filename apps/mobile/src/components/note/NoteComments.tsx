import { showClientError } from "@carlnotes/client/apiClient"
import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import {
	type NoteCommentComposerProps,
	type NoteCommentsElements,
	type NoteCommentsProps,
	NoteComments as SharedNoteComments,
} from "@carlnotes/core/components/NoteComments"
import { NOTE_COMMENT_DELETE } from "@carlnotes/core/lib/noteLabels"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { BottomSheetTextInput } from "@gorhom/bottom-sheet"
import { Trash2 } from "lucide-react-native"
import type { ComponentType } from "react"
import { Alert, TextInput, type TextInputProps, View } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { toTypeRoleStyle } from "@/typeRoleStyles"

// keep comment content and ordering shared while adapting the web's typography and controls
const ELEMENTS: NoteCommentsElements = {
	Container: ({ children }) => <View className="gap-3">{children}</View>,
	Message: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	Retry: ({ onPress }) => (
		<Button accessibilityLabel="Retry comments" variant="link" size="sm" onPress={onPress}>
			<Text>Try again</Text>
		</Button>
	),
	List: ({ children }) => <View className="gap-3">{children}</View>,
	Row: ({ children }) => <View className="gap-1">{children}</View>,
	Header: ({ children }) => <View className="flex-row flex-wrap items-center gap-2">{children}</View>,
	Author: ({ author }) =>
		author ? (
			<AnchorLink
				href={`${SITE_URL}/profiles/${author.userId}`}
				accessibilityLabel={`Open ${author.username}'s profile`}
				className="min-h-6 min-w-6 shrink flex-row items-center gap-2"
				hitSlop={toTouchTargetHitSlop(24)}
			>
				<Avatar
					ownerId={author.userId}
					name={author.username}
					imageUrl={author.avatarVersion ? toAvatarImagePath(author.userId, author.avatarVersion) : null}
				/>
				<Text className="shrink text-sm font-semibold text-link">{author.username}</Text>
			</AnchorLink>
		) : (
			<Text className="text-sm font-semibold text-muted-foreground">A closed account</Text>
		),
	Age: ({ children }) => <Text className="text-xs text-muted-foreground">{children}</Text>,
	Body: ({ children }) => (
		<Text selectable className="text-sm">
			{children}
		</Text>
	),
	Delete: ({ onPress, isPending }) => (
		<Button
			accessibilityLabel="Delete comment"
			variant="ghost"
			size="icon"
			className="ml-auto"
			onPress={() =>
				Alert.alert(NOTE_COMMENT_DELETE.title, NOTE_COMMENT_DELETE.description, [
					{ text: NOTE_COMMENT_DELETE.cancelLabel, style: "cancel" },
					{ text: NOTE_COMMENT_DELETE.confirmLabel, style: "destructive", onPress },
				])
			}
			disabled={isPending}
		>
			<Icon as={Trash2} className="size-3.5 text-muted-foreground" />
		</Button>
	),
	Composer: CommentComposer,
}
// let the sheet follow the composer's keyboard while sharing every other comment element
const SHEET_ELEMENTS: NoteCommentsElements = {
	...ELEMENTS,
	Composer: (props) => <CommentComposer {...props} Input={BottomSheetTextInput} />,
}

/**
 * Shows the shared note thread with mobile controls.
 */
export function NoteComments({
	isInSheet = false,
	...props
}: Omit<NoteCommentsProps, "onError"> & { isInSheet?: boolean }) {
	return <SharedNoteComments {...props} onError={showClientError} elements={isInSheet ? SHEET_ELEMENTS : ELEMENTS} />
}

// allow multiline input and keep failed text in the shared composer
function CommentComposer({
	value,
	onChange,
	onSubmit,
	isPending,
	canSubmit,
	maxLength,
	Input = TextInput,
}: NoteCommentComposerProps & { Input?: ComponentType<TextInputProps> }) {
	return (
		<View className="gap-2">
			<Input
				accessibilityLabel="Comment"
				value={value}
				onChangeText={onChange}
				multiline
				placeholder="Add a comment"
				maxLength={maxLength}
				style={toTypeRoleStyle("bodyLarge")}
				textAlignVertical="top"
				className="min-h-16 rounded-md border border-input bg-card px-3 py-2 text-foreground"
			/>
			<Button
				accessibilityLabel="Post comment"
				size="sm"
				className="self-end"
				onPress={onSubmit}
				disabled={!canSubmit || isPending}
			>
				<Text>{isPending ? "Posting…" : "Comment"}</Text>
			</Button>
		</View>
	)
}
