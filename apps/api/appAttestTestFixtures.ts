// the App Attest tests' certificates, written as DER by hand over node:crypto keys, so no test needs a certificate
// library

import { createSign, type KeyObject } from "node:crypto"

// the object identifiers a test certificate names: ecdsa-with-SHA256 and the common name
const ECDSA_WITH_SHA256_OID = "1.2.840.10045.4.3.2"
const COMMON_NAME_OID = "2.5.4.3"

// the DER tags the certificates use
const SEQUENCE_TAG = 0x30
const SET_TAG = 0x31
const INTEGER_TAG = 0x02
const BIT_STRING_TAG = 0x03
const OCTET_STRING_TAG = 0x04
const OBJECT_IDENTIFIER_TAG = 0x06
const UTF8_STRING_TAG = 0x0c
const UTC_TIME_TAG = 0x17

// a certificate extension: its object identifier and its DER-encoded value
export type TestExtension = { oid: string; value: Buffer }

// what a test certificate is made from
export interface TestCertificateOptions {
	subjectName: string
	issuerName: string
	publicKey: KeyObject
	signingKey: KeyObject
	extensions?: TestExtension[]
}

/**
 * Returns a version 3 X.509 certificate as DER, signed with ECDSA and SHA-256, valid from a day ago for a year.
 */
export function toTestCertificateDer({
	subjectName,
	issuerName,
	publicKey,
	signingKey,
	extensions = [],
}: TestCertificateOptions): Buffer {
	// the validity window and the signature algorithm
	const notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000)
	const notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
	const signatureAlgorithm = der(SEQUENCE_TAG, derObjectIdentifier(ECDSA_WITH_SHA256_OID))

	// the certificate's signed part: version 3, a serial, the algorithm, the names, the validity, the key, the extensions
	const toBeSigned = der(
		SEQUENCE_TAG,
		der(0xa0, der(INTEGER_TAG, Buffer.from([2]))),
		der(INTEGER_TAG, Buffer.from([0x01, 0x02, 0x03])),
		signatureAlgorithm,
		derName(issuerName),
		der(SEQUENCE_TAG, derUtcTime(notBefore), derUtcTime(notAfter)),
		derName(subjectName),
		publicKey.export({ type: "spki", format: "der" }),
		derExtensions(extensions),
	)

	// sign it, and wrap the signed part, the algorithm, and the signature
	const signature = createSign("sha256").update(toBeSigned).sign(signingKey)
	return der(SEQUENCE_TAG, toBeSigned, signatureAlgorithm, der(BIT_STRING_TAG, Buffer.from([0]), signature))
}

// the extensions as the explicit [3] tag, or nothing when there are none
function derExtensions(extensions: TestExtension[]): Buffer {
	if (extensions.length === 0) {
		return Buffer.alloc(0)
	}
	const extensionsDer = extensions.map((extension) =>
		der(SEQUENCE_TAG, derObjectIdentifier(extension.oid), der(OCTET_STRING_TAG, extension.value)),
	)
	return der(0xa3, der(SEQUENCE_TAG, ...extensionsDer))
}

/**
 * Returns Apple's nonce extension value: a SEQUENCE holding a context tag that holds the nonce as an OCTET STRING.
 */
export function toNonceExtensionValue(nonce: Buffer): Buffer {
	return der(SEQUENCE_TAG, der(0xa1, der(OCTET_STRING_TAG, nonce)))
}

// a DER element: the tag, the content's length, and the content
function der(tag: number, ...contentParts: Buffer[]): Buffer {
	const content = Buffer.concat(contentParts)
	return Buffer.concat([Buffer.from([tag]), derLength(content.length), content])
}

// a DER length: one byte under 128, else a count byte and the big-endian length bytes
function derLength(length: number): Buffer {
	if (length < 128) {
		return Buffer.from([length])
	}
	const lengthHex = length.toString(16)
	const lengthBytes = Buffer.from(lengthHex.padStart(lengthHex.length + (lengthHex.length % 2), "0"), "hex")
	return Buffer.concat([Buffer.from([0x80 | lengthBytes.length]), lengthBytes])
}

// a name with one common name
function derName(commonName: string): Buffer {
	const commonNameAttribute = der(
		SEQUENCE_TAG,
		derObjectIdentifier(COMMON_NAME_OID),
		der(UTF8_STRING_TAG, Buffer.from(commonName)),
	)
	return der(SEQUENCE_TAG, der(SET_TAG, commonNameAttribute))
}

// an object identifier: the first two arcs in one byte, then each arc in base 128 with continuation bits
function derObjectIdentifier(oid: string): Buffer {
	const [firstArc = 0, secondArc = 0, ...arcs] = oid.split(".").map(Number)
	const arcBytes = arcs.flatMap((arc) => {
		// the arc's 7-bit groups, most significant first, each but the last with its high bit set
		const groups: number[] = []
		let remaining = arc
		do {
			groups.unshift(remaining & 0x7f)
			remaining >>= 7
		} while (remaining > 0)

		// every group but the last has its continuation bit set
		return groups.map((group, i) => (i < groups.length - 1 ? group | 0x80 : group))
	})

	// the first two arcs share one byte
	return der(OBJECT_IDENTIFIER_TAG, Buffer.from([firstArc * 40 + secondArc, ...arcBytes]))
}

// a UTC time as YYMMDDHHMMSSZ
function derUtcTime(date: Date): Buffer {
	const utcTime = date.toISOString().replaceAll(/[-:T]/g, "").slice(2, 14)
	return der(UTC_TIME_TAG, Buffer.from(`${utcTime}Z`))
}
