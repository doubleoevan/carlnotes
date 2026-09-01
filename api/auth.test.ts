// the signup avatar default: an oauth photo is the default when the provider supplied one, otherwise initials
import { expect, test } from "bun:test"
import { toSignupAvatarSource } from "./auth"

// an oauth signup defaults to the provider's photo, a password signup never has one
test("a signup with a provider photo defaults to it", () => {
	expect(toSignupAvatarSource("https://lh3.googleusercontent.com/a/photo.jpg")).toBe("oauth")
})

// no photo, empty string, or null all fall back to the generated initials
test("a signup with no provider photo falls back to generated initials", () => {
	expect(toSignupAvatarSource(null)).toBe("generated")
	expect(toSignupAvatarSource(undefined)).toBe("generated")
	expect(toSignupAvatarSource("")).toBe("generated")
})
