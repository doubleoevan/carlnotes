import { toProfilePath } from "@carlnotes/contracts/seo"
import { type NoteDetailsElements, NoteDetails as SharedNoteDetails } from "@carlnotes/core/components/NoteDetails"
import { toCommentsToggleLabel } from "@carlnotes/core/lib/noteLabels"
import { MessageSquareText } from "lucide-react-native"
import type { ComponentProps } from "react"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * Renders the web's open note frame: the visibility and the controls on one row, then the name and the owner's byline.
 */
export function NoteDetails(props: Omit<ComponentProps<typeof SharedNoteDetails>, "elements">) {
	return <SharedNoteDetails {...props} elements={NOTE_DETAILS_ELEMENTS} />
}

// native rows in the web's order. the comments toggle opens the thread's sheet, which shows over the note
const NOTE_DETAILS_ELEMENTS: NoteDetailsElements = {
	HeaderRow: ({ children }) => <View className="min-h-9 flex-row items-center justify-between gap-2">{children}</View>,
	Controls: ({ children }) => <View className="ml-auto flex-row items-center gap-2">{children}</View>,
	CommentsToggle: ({ isOpen, onToggle }) => (
		<Button accessibilityLabel={toCommentsToggleLabel(isOpen)} variant="outline" size="sm" onPress={onToggle}>
			<Icon as={MessageSquareText} className="size-4 text-foreground" />
			<Text>Comments</Text>
		</Button>
	),
	Title: ({ children }) => (
		<Text accessibilityRole="header" className="text-center" style={toTypeRoleStyle("pageTitle")}>
			{children}
		</Text>
	),
	Byline: ({ owner }) => (
		<View className="flex-row justify-center">
			<Text className="text-sm text-muted-foreground">by </Text>
			<AnchorLink href={toProfilePath(owner.id)} accessibilityLabel={`by ${owner.username}`}>
				<Text className="text-sm text-link">{owner.username}</Text>
			</AnchorLink>
		</View>
	),
}
