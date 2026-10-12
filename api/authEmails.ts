// the emails that Better Auth sends: the reset-password link, the change-of-address confirmation, and the signup
// verification link, with the reset links a password reset clears
import { appBaseUrl } from "@shared/appUrl"
import { and, eq, like } from "drizzle-orm"
import { db, schema } from "../db"
import { deleteRedisKeys } from "../db/redis"
import { renderAuthEmail, renderAuthEmailText } from "../emails/auth-email"
import { sendEmail } from "../worker/email"

// how long an email-verification link works, which the email that carries it also states
export const VERIFICATION_LINK_HOURS = 24

/**
 * Deletes every outstanding reset-password link of a user from Postgres and from Redis.
 */
export async function clearResetPasswordTokens(userId: string): Promise<void> {
	// delete the user's reset-password rows and return each row's identifier
	const deletedVerifications = await db
		.delete(schema.verifications)
		.where(and(like(schema.verifications.identifier, "reset-password:%"), eq(schema.verifications.value, userId)))
		.returning({ identifier: schema.verifications.identifier })

	// delete each row's Redis copy, which Better Auth keys by the row's identifier
	await deleteRedisKeys(...deletedVerifications.map(({ identifier }) => `verification:${identifier}`))
}

/**
 * Sends the reset-password link.
 */
export async function sendResetPasswordEmail(email: string, url: string): Promise<void> {
	const emailProps = {
		heading: "Reset your password",
		lead: "Carl can let you back in. Pick a new password with the link below.",
		buttonLabel: "Reset your password",
		url,
		linkNote: "The link works once and expires in an hour.",
		appUrl: appBaseUrl(),
	}
	await sendEmail({
		to: email,
		subject: "Reset your password",
		emailContent: await renderAuthEmail(emailProps),
		plainTextContent: await renderAuthEmailText(emailProps),
		emailKind: "password-reset",
	})
}

/**
 * Sends the link that authorizes a change of address to the current address instead of the new one.
 */
export async function sendChangeEmailConfirmationEmail(
	currentEmail: string,
	newEmail: string,
	url: string,
): Promise<void> {
	const emailProps = {
		heading: "Confirm your new email",
		lead: `Someone asked to move this account to ${newEmail}. Confirm it and Carl will send notes to the new address.`,
		buttonLabel: "Confirm the change",
		url,
		linkNote: "Nothing changes until you confirm.",
		appUrl: appBaseUrl(),
	}
	await sendEmail({
		to: currentEmail,
		subject: "Confirm your new email",
		emailContent: await renderAuthEmail(emailProps),
		plainTextContent: await renderAuthEmailText(emailProps),
		emailKind: "email-change",
	})
}

/**
 * Sends the signup email-verification link. A delivery failure is logged but not fatal.
 */
export async function sendVerificationEmail(email: string, url: string): Promise<void> {
	const emailProps = {
		heading: "Confirm your email",
		lead: `Carl is ready to start reading for you. Confirm this address so he knows where to send what he finds. The link works for ${VERIFICATION_LINK_HOURS} hours.`,
		buttonLabel: "Confirm your email",
		url,
		appUrl: appBaseUrl(),
	}
	await sendEmail({
		to: email,
		subject: "Confirm your email",
		emailContent: await renderAuthEmail(emailProps),
		plainTextContent: await renderAuthEmailText(emailProps),
		emailKind: "verification",
	})
}
