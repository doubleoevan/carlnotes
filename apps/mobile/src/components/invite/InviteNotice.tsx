import {
	INVITE_CHECK_FAILED_TEXT,
	INVITE_CHECK_RETRY_ACTION,
	INVITE_CHECK_RETRY_LEAD,
	INVITE_CHECKING_TEXT,
	INVITE_REJECTED_FOLLOW_UP_ACTION,
	INVITE_REJECTED_FOLLOW_UP_LEAD,
	INVITE_REJECTIONS,
	INVITE_TEAM_FULL_FOLLOW_UP,
	type InviteNoticeProps,
} from "@carlnotes/core/lib/inviteRejections"
import { Text as NativeText, View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Text } from "@/components/primitives/text"

/**
 * The invitation screen's notice, with the web page's words: the check in progress, a failed request with its retry,
 * or the rejection and what to do about it.
 */
export function InviteNotice({ isInviteAcceptFailed, inviteRejection, onRetry }: InviteNoticeProps) {
	// a failed request is retried from here, and never reads as a rejected invitation
	if (isInviteAcceptFailed) {
		return (
			<View className="items-center gap-2">
				<Text className="text-center text-lg font-semibold">{INVITE_CHECK_FAILED_TEXT}</Text>
				<Text className="text-center text-sm text-muted-foreground">
					{INVITE_CHECK_RETRY_LEAD}
					<NativeText accessibilityRole="button" className="text-link underline" onPress={onRetry}>
						{INVITE_CHECK_RETRY_ACTION}
					</NativeText>
				</Text>
			</View>
		)
	}
	if (!inviteRejection) {
		return <Text className="text-center text-sm text-muted-foreground">{INVITE_CHECKING_TEXT}</Text>
	}
	return (
		<View className="items-center gap-2">
			<Text className="text-center text-lg font-semibold">{INVITE_REJECTIONS[inviteRejection]}</Text>
			<Text className="text-center text-sm text-muted-foreground">
				{inviteRejection === "teamFull" ? (
					INVITE_TEAM_FULL_FOLLOW_UP
				) : (
					<>
						{INVITE_REJECTED_FOLLOW_UP_LEAD}
						<AnchorLink href="/" accessibilityLabel={INVITE_REJECTED_FOLLOW_UP_ACTION} asChild>
							<NativeText accessibilityRole="link" className="text-link underline">
								{INVITE_REJECTED_FOLLOW_UP_ACTION}
							</NativeText>
						</AnchorLink>
					</>
				)}
			</Text>
		</View>
	)
}
