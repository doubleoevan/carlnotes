// the words on the gate in front of an invite-only topic's page or its podcast episode's page, the same on the web
// and in the app

export const TOPIC_GATE_COPY = {
	title: "This topic is invite-only",
	signedInBody: "Ask the topic owner for an invite to see it.",
	visitorBody: "Sign up to see it.",
	backAction: "Back to CarlNotes",
	logInAction: "Log in",
	signUpAction: "Sign up",
} as const

// whether the user is signed in, and the path that a visitor returns to
export type TopicGateNoticeProps = { isSignedIn: boolean; returnPath: string }
