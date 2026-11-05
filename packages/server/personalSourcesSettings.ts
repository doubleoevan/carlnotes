// rollout switches stop new input while preserving reads and cleanup
import { personalSourcesEmailAddress } from "@carlnotes/contracts/personalSourcesEmail"
import { toEmailSenderAddress } from "./personalSourcesEmailContent"
import { encryptPrivateText } from "./privateText"

/**
 * Returns the receiving configuration failure, or null when encrypted input is available.
 */
export function personalSourcesReceivingFailure(): "disabled" | "encryption" | null {
	if (!isPersonalSourcesReceivingEnabled()) {
		return "disabled"
	}
	try {
		encryptPrivateText("")
		return null
	} catch {
		return "encryption"
	}
}

/**
 * Whether explicit AI Agent sends and selected chat imports are enabled on this server.
 */
export function isPersonalSourcesReceivingEnabled(): boolean {
	return Bun.env.PERSONAL_SOURCES_RECEIVING_ENABLED === "true"
}

/**
 * Whether signed inbound email may be accepted, after the receiving domain is configured.
 */
export function isPersonalSourcesEmailEnabled(): boolean {
	return isPersonalSourcesReceivingEnabled() && Bun.env.PERSONAL_SOURCES_EMAIL_ENABLED === "true"
}

/**
 * Reads the digest sender's mailbox as this environment's receiving address.
 */
export function readPersonalSourcesEmailAddress(): string {
	const from = Bun.env.RESEND_FROM_EMAIL?.trim() ?? ""
	const configured = personalSourcesEmailAddress.safeParse(toEmailSenderAddress(from))
	if (!configured.success) {
		throw new Error("Set RESEND_FROM_EMAIL to one valid sending and receiving mailbox")
	}
	return configured.data.toLowerCase()
}

/**
 * Rejects enabled email receiving without a valid shared mailbox at startup.
 */
export function validatePersonalSourcesEmailSettings(): void {
	if (isPersonalSourcesEmailEnabled()) {
		readPersonalSourcesEmailAddress()
	}
}
