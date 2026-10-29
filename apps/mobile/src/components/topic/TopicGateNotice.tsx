import { TOPIC_GATE_COPY, type TopicGateNoticeProps } from "@carlnotes/core/lib/topicGateCopy"
import { router } from "expo-router"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { openSessionScreen } from "@/sessionReturnPath"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * The gate in front of an invite-only Topic's screen or its podcast episode's screen, with the web gate's words: a user
 * goes back to CarlNotes, and a visitor logs in or signs up and returns here.
 */
export function TopicGateNotice({ isSignedIn, returnPath }: TopicGateNoticeProps) {
	return (
		<View className="gap-4 px-4 py-6">
			<Text accessibilityRole="header" style={toTypeRoleStyle("pageTitle")} className="text-foreground">
				{TOPIC_GATE_COPY.title}
			</Text>
			<Text style={toTypeRoleStyle("body")} className="text-muted-foreground">
				{isSignedIn ? TOPIC_GATE_COPY.signedInBody : TOPIC_GATE_COPY.visitorBody}
			</Text>
			{isSignedIn ? (
				<Button
					accessibilityLabel={TOPIC_GATE_COPY.backAction}
					className="self-start"
					onPress={() => router.replace("/")}
				>
					<Text>{TOPIC_GATE_COPY.backAction}</Text>
				</Button>
			) : (
				<View className="flex-row gap-3">
					<Button
						variant="outline"
						accessibilityLabel={TOPIC_GATE_COPY.logInAction}
						onPress={() => openSessionScreen({ screen: "/sign-in", returnPath })}
					>
						<Text>{TOPIC_GATE_COPY.logInAction}</Text>
					</Button>
					<Button
						accessibilityLabel={TOPIC_GATE_COPY.signUpAction}
						onPress={() => openSessionScreen({ screen: "/sign-up", returnPath })}
					>
						<Text>{TOPIC_GATE_COPY.signUpAction}</Text>
					</Button>
				</View>
			)}
		</View>
	)
}
