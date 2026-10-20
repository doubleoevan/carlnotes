// the signup page's toast for each action that sends a visitor there, and none for a link they picked on purpose
import { expect, test } from "bun:test"
import { toCtaPrompt } from "@/hooks/useCtaPromptToast"
import { SIGNUP_PROMPTS, toSignupHref } from "./signupPrompts"

// an action's call to action names its prompt, and a header or menu link names none
test("a signup prompt names what an action unlocks and nothing for a sign-up link", () => {
	expect(toCtaPrompt(SIGNUP_PROMPTS, "podcast-question")).toBe("Sign up to speak with Carl and Vienna")
	expect(toCtaPrompt(SIGNUP_PROMPTS, "chat-voice")).toBe("Sign up to speak with Carl")
	expect(toCtaPrompt(SIGNUP_PROMPTS, "header")).toBeNull()
	expect(toCtaPrompt(SIGNUP_PROMPTS, "toString")).toBeNull()
	expect(toCtaPrompt(SIGNUP_PROMPTS, null)).toBeNull()
})

// the link names the action's call to action and the page to return to
test("toSignupHref names the action's call to action and the page to return to", () => {
	expect(toSignupHref("note", "/topics/t-1/espresso?tab=notes")).toBe(
		"/signup?cta=note&next=%2Ftopics%2Ft-1%2Fespresso%3Ftab%3Dnotes",
	)
})
