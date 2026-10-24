// the App Attest verifier: Apple's steps over the attestation an iOS install made for a signup-gate challenge

import { createHash, X509Certificate } from "node:crypto"
import { decode } from "cbor2"
import type { GateProofCheck } from "./signupGate"

// the first half of Apple's App Attest root certificate, from
// https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem
const ROOT_CERTIFICATE_BODY_START = [
	"MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw",
	"JAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK",
	"QXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa",
	"Fw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv",
	"biBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y",
	"bmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh",
	"NbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au",
]

// the second half of the root certificate
const ROOT_CERTIFICATE_BODY_END = [
	"Yen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/",
	"MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw",
	"CgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn",
	"53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV",
	"oyFraWVIyd/dganmrduC1bmTBGwD",
]

// Apple's App Attest root certificate as PEM
export const APPLE_APP_ATTEST_ROOT_CERTIFICATE_PEM = [
	"-----BEGIN CERTIFICATE-----",
	...ROOT_CERTIFICATE_BODY_START,
	...ROOT_CERTIFICATE_BODY_END,
	"-----END CERTIFICATE-----",
].join("\n")

// the leaf certificate extension that holds the nonce Apple computed, as its DER-encoded object identifier
const APPLE_NONCE_EXTENSION_OID_DER = Buffer.from("06092a864886f763640802", "hex")

// the aaguid of a production attestation, and of one from a development-signed build
const PRODUCTION_AAGUID = Buffer.concat([Buffer.from("appattest"), Buffer.alloc(7)])
const DEVELOPMENT_AAGUID = Buffer.from("appattestdevelop")

// the authenticator data layout: the RP ID hash, one flags byte, the counter, the aaguid, then the credential id
const COUNTER_OFFSET = 33
const AAGUID_OFFSET = 37
const CREDENTIAL_ID_LENGTH_OFFSET = 53
const CREDENTIAL_ID_OFFSET = 55

// what a verification takes: the app's base64 attestation and key id, the challenge string the app attested, the app
// id as team id dot bundle identifier, the root to chain to, and whether a development-signed build passes
export interface VerifyAppAttestationOptions {
	attestation: string
	keyId: string
	challenge: string
	appId: string
	rootCertificatePem?: string
	isDevelopmentAllowed?: boolean
}

// the attestation object as the app sends it, once decoded from CBOR
interface AttestationObject {
	x5c: Uint8Array[]
	authData: Buffer
}

/**
 * Verifies an App Attest attestation by Apple's steps, and returns the step that rejected it. Never throws.
 */
export async function verifyAppAttestation(options: VerifyAppAttestationOptions): Promise<GateProofCheck> {
	try {
		return checkAppAttestation(options)
	} catch {
		return { ok: false, reason: "format" }
	}
}

// Apple's steps in order. a value that does not parse throws, and the caller reads that as a format rejection
function checkAppAttestation({
	attestation,
	keyId,
	challenge,
	appId,
	rootCertificatePem = APPLE_APP_ATTEST_ROOT_CERTIFICATE_PEM,
	isDevelopmentAllowed = false,
}: VerifyAppAttestationOptions): GateProofCheck {
	// decode the attestation object and check its shape
	const attestationObject = toAttestationObject(decode(Buffer.from(attestation, "base64")))
	if (!attestationObject) {
		return { ok: false, reason: "format" }
	}
	const { x5c, authData } = attestationObject

	// the chain from the leaf to the root
	const certificates = x5c.map((certificateDer) => new X509Certificate(Buffer.from(certificateDer)))
	const rootCertificate = new X509Certificate(rootCertificatePem)
	if (!isChainTrusted(certificates, rootCertificate)) {
		return { ok: false, reason: "chain" }
	}

	// the nonce over the authenticator data and the challenge's hash, against the leaf's extension
	const leafCertificate = certificates[0] as X509Certificate
	const clientDataHash = sha256(Buffer.from(challenge, "utf8"))
	const nonce = sha256(Buffer.concat([authData, clientDataHash]))
	if (!readNonceExtension(leafCertificate.raw).equals(nonce)) {
		return { ok: false, reason: "nonce" }
	}

	// the key id is the hash of the leaf's public key as an uncompressed point
	const keyIdBytes = Buffer.from(keyId, "base64")
	const { x, y } = leafCertificate.publicKey.export({ format: "jwk" })
	const publicKeyPoint = Buffer.concat([
		Buffer.from([0x04]),
		Buffer.from(x ?? "", "base64url"),
		Buffer.from(y ?? "", "base64url"),
	])
	if (!sha256(publicKeyPoint).equals(keyIdBytes)) {
		return { ok: false, reason: "key id" }
	}

	// the RP ID hash is the app id's hash, and a fresh key has a zero counter
	if (!authData.subarray(0, 32).equals(sha256(Buffer.from(appId, "utf8")))) {
		return { ok: false, reason: "app id" }
	}
	if (authData.readUInt32BE(COUNTER_OFFSET) !== 0) {
		return { ok: false, reason: "counter" }
	}

	// the aaguid names the environment
	const aaguid = authData.subarray(AAGUID_OFFSET, CREDENTIAL_ID_LENGTH_OFFSET)
	const isDevelopmentAaguid = aaguid.equals(DEVELOPMENT_AAGUID)
	if (!(aaguid.equals(PRODUCTION_AAGUID) || (isDevelopmentAaguid && isDevelopmentAllowed))) {
		return { ok: false, reason: "environment" }
	}

	// the credential id is the key id
	const credentialIdLength = authData.readUInt16BE(CREDENTIAL_ID_LENGTH_OFFSET)
	const credentialId = authData.subarray(CREDENTIAL_ID_OFFSET, CREDENTIAL_ID_OFFSET + credentialIdLength)
	if (!credentialId.equals(keyIdBytes)) {
		return { ok: false, reason: "credential id" }
	}
	return { ok: true }
}

// the decoded CBOR as an attestation object, or null if it has another shape. a CBOR map decodes as a Map or an object
function toAttestationObject(decoded: unknown): AttestationObject | null {
	// the format, the chain, and the authenticator data
	const attestationObject = toRecord(decoded)
	const attestationStatement = toRecord(attestationObject?.attStmt)
	const x5c = attestationStatement?.x5c
	const authData = attestationObject?.authData

	// Apple's format, at least a leaf and an intermediate, and authenticator data long enough to hold a credential id
	const isChain = Array.isArray(x5c) && x5c.length >= 2 && x5c.every((entry) => entry instanceof Uint8Array)
	const isAuthData = authData instanceof Uint8Array && authData.length >= CREDENTIAL_ID_OFFSET
	if (attestationObject?.fmt !== "apple-appattest" || !isChain || !isAuthData) {
		return null
	}
	return { x5c, authData: Buffer.from(authData) }
}

// a decoded CBOR map as a plain record
function toRecord(value: unknown): Record<string, unknown> | null {
	if (value instanceof Map) {
		return Object.fromEntries(value)
	}
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null
}

// whether each certificate was issued and signed by the next one, and the last by the root, and each is valid today
function isChainTrusted(certificates: X509Certificate[], rootCertificate: X509Certificate): boolean {
	const now = Date.now()
	return certificates.every((certificate, i) => {
		const issuerCertificate = certificates[i + 1] ?? rootCertificate
		const isValidNow = Date.parse(certificate.validFrom) <= now && now <= Date.parse(certificate.validTo)
		return isValidNow && certificate.checkIssued(issuerCertificate) && certificate.verify(issuerCertificate.publicKey)
	})
}

// the nonce inside Apple's extension: after the extension's object identifier comes an OCTET STRING holding a SEQUENCE,
// a context tag, and the nonce as an OCTET STRING, all with short lengths. an absent extension reads as no nonce
function readNonceExtension(certificateDer: Buffer): Buffer {
	const oidOffset = certificateDer.indexOf(APPLE_NONCE_EXTENSION_OID_DER)
	if (oidOffset === -1) {
		return Buffer.alloc(0)
	}

	// skip a critical flag if there is one, then step into the wrapping OCTET STRING
	let offset = oidOffset + APPLE_NONCE_EXTENSION_OID_DER.length
	if (certificateDer[offset] === 0x01) {
		offset += 3
	}
	const extensionValue = certificateDer.subarray(offset + 2)

	// the SEQUENCE, the context tag, and the OCTET STRING that holds the nonce
	const isNonceShape = certificateDer[offset] === 0x04 && extensionValue[0] === 0x30 && extensionValue[2] === 0xa1
	if (!isNonceShape || extensionValue[4] !== 0x04) {
		return Buffer.alloc(0)
	}
	const nonceLength = extensionValue[5] ?? 0
	return extensionValue.subarray(6, 6 + nonceLength)
}

// the SHA-256 digest of bytes
function sha256(bytes: Buffer): Buffer {
	return createHash("sha256").update(bytes).digest()
}
