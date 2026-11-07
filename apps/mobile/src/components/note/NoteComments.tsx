import { showClientError } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import type { NoteComment } from "@carlnotes/contracts/notes"
import { toProfilePath } from "@carlnotes/contracts/seo"
import { SITE_URL } from "@carlnotes/contracts/site"
import {
	type NoteCommentsElements,
	type NoteCommentsProps,
	NoteComments as SharedNoteComments,
} from "@carlnotes/core/components/NoteComments"
import { NOTE_COMMENT_DELETE, REPORT_COMMENT_LABEL } from "@carlnotes/core/lib/noteLabels"
import { toCommentReportProps } from "@carlnotes/core/lib/reportCopy"
import { Flag, Trash2 } from "lucide-react-native"
import { useState } from "react"
import { Alert, TextInput, View } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { COMMENT_ELEMENTS, SOCIAL_ELEMENTS, SocialComposer } from "@/components/social/socialElements"

// keep comment content and ordering shared while adapting the web's typography and controls
const ELEMENTS: NoteCommentsElements = {
	...COMMENT_ELEMENTS,
	Container: ({ children }) => <View className="gap-3">{children}</View>,
	Retry: ({ onPress }) => (
		<Button accessibilityLabel="Retry comments" variant="link" size="sm" onPress={onPress}>
			<Text>Try again</Text>
		</Button>
	),
	Header: SOCIAL_ELEMENTS.Header,
	Author: ({ author }) =>
		author ? (
			<AnchorLink
				href={`${SITE_URL}${toProfilePath(author.userId)}`}
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
	Report: ({ onPress }) => (
		<Button accessibilityLabel={REPORT_COMMENT_LABEL} variant="ghost" size="icon" className="ml-auto" onPress={onPress}>
			<Icon as={Flag} className="size-3.5 text-muted-foreground" />
		</Button>
	),
	Composer: (props) => <SocialComposer {...props} Input={TextInput} />,
}
// let the sheet follow the composer's keyboard while sharing every other comment element
const SHEET_ELEMENTS: NoteCommentsElements = { ...ELEMENTS, Composer: COMMENT_ELEMENTS.Composer }

/**
 * Shows the shared note thread with mobile controls.
 */
export function NoteComments({
	isInSheet = false,
	...props
}: Omit<NoteCommentsProps, "onError" | "onReport"> & { isInSheet?: boolean }) {
	// a signed-in user can report another person's comment, and block its author from the report
	const { data: session } = authClient().useSession()
	const [reportedComment, setReportedComment] = useState<NoteComment | null>(null)
	const commentReportProps = reportedComment && toCommentReportProps("noteComment", reportedComment)
	return (
		<>
			<SharedNoteComments
				{...props}
				onError={showClientError}
				onReport={session ? setReportedComment : undefined}
				elements={isInSheet ? SHEET_ELEMENTS : ELEMENTS}
			/>
			{commentReportProps && <ReportIssueDialog {...commentReportProps} onClose={() => setReportedComment(null)} />}
		</>
	)
}
