// the App Attest verifier over a synthetic chain: a valid attestation passes, and each of Apple's steps rejects

import { expect, test } from "bun:test"
import { createHash, generateKeyPairSync, type KeyObject, X509Certificate } from "node:crypto"
import { encode } from "cbor2"
import { verifyAppAttestation } from "./appAttest"
import { toNonceExtensionValue, toTestCertificateDer } from "./appAttestTestFixtures"

// the nonce extension's object identifier, and the two aaguids
const APPLE_NONCE_EXTENSION_OID = "1.2.840.113635.100.8.2"
const PRODUCTION_AAGUID = Buffer.concat([Buffer.from("appattest"), Buffer.alloc(7)])
const DEVELOPMENT_AAGUID = Buffer.from("appattestdevelop")

// the values a passing attestation is made for
const CHALLENGE = "challenge-1"
const APP_ID = "TEAMID1234.com.carlnotes.app"

// a test root: its name, its keys, and its PEM
type TestRoot = { name: string; keys: { publicKey: KeyObject; privateKey: KeyObject }; pem: string }

// what a synthetic attestation is built from
type AttestationOptions = {
	root: TestRoot
	signingRoot?: TestRoot
	challenge?: string
	appId?: string
	counter?: number
	aaguid?: Buffer
}

// the two roots every test shares, made once
const root = toTestRoot("Test App Attest Root")
const otherRoot = toTestRoot("Other Root")

// a valid attestation passes every step
test("a valid attestation passes", async () => {
	const { attestation, keyId } = toTestAttestation({ root })
	expect(await verify({ attestation, keyId })).toEqual({ ok: true })
})

// a leaf signed under another root does not chain to the given root
test("a chain to another root is rejected", async () => {
	const { attestation, keyId } = toTestAttestation({ root, signingRoot: otherRoot })
	expect(await verify({ attestation, keyId })).toEqual({ ok: false, reason: "chain" })
})

// a different challenge changes the nonce
test("a changed challenge is rejected", async () => {
	const { attestation, keyId } = toTestAttestation({ root, challenge: "another challenge" })
	expect(await verify({ attestation, keyId })).toEqual({ ok: false, reason: "nonce" })
})

// a key id that is not the leaf key's hash is rejected
test("a wrong key id is rejected", async () => {
	const { attestation } = toTestAttestation({ root })
	const wrongKeyId = sha256(Buffer.from("another key")).toString("base64")
	expect(await verify({ attestation, keyId: wrongKeyId })).toEqual({ ok: false, reason: "key id" })
})

// an attestation made for another app id is rejected
test("a wrong app id is rejected", async () => {
	const { attestation, keyId } = toTestAttestation({ root, appId: "TEAMID1234.com.other.app" })
	expect(await verify({ attestation, keyId })).toEqual({ ok: false, reason: "app id" })
})

// a fresh key has a zero counter
test("a nonzero counter is rejected", async () => {
	const { attestation, keyId } = toTestAttestation({ root, counter: 1 })
	expect(await verify({ attestation, keyId })).toEqual({ ok: false, reason: "counter" })
})

// the development aaguid passes only where development is allowed
test("the development environment is rejected by default and allowed in dev", async () => {
	const { attestation, keyId } = toTestAttestation({ root, aaguid: DEVELOPMENT_AAGUID })
	expect(await verify({ attestation, keyId })).toEqual({ ok: false, reason: "environment" })
	expect(await verify({ attestation, keyId, isDevelopmentAllowed: true })).toEqual({ ok: true })
})

// bytes that are not an attestation object are a format rejection, never a thrown error
test("garbage is rejected as a format error", async () => {
	expect(await verify({ attestation: "not cbor at all", keyId: "a2V5" })).toEqual({ ok: false, reason: "format" })
	const otherFormat = Buffer.from(encode({ fmt: "fido" })).toString("base64")
	expect(await verify({ attestation: otherFormat, keyId: "a2V5" })).toEqual({ ok: false, reason: "format" })
})

// verify against the shared root for the shared challenge and app id
function verify(options: {
	attestation: string
	keyId: string
	isDevelopmentAllowed?: boolean
}): ReturnType<typeof verifyAppAttestation> {
	return verifyAppAttestation({ ...options, challenge: CHALLENGE, appId: APP_ID, rootCertificatePem: root.pem })
}

// a self-signed root certificate authority
function toTestRoot(name: string): TestRoot {
	const keys = generateKeyPairSync("ec", { namedCurve: "P-256" })
	const certificateDer = toTestCertificateDer({
		subjectName: name,
		issuerName: name,
		publicKey: keys.publicKey,
		signingKey: keys.privateKey,
	})
	return { name, keys, pem: new X509Certificate(certificateDer).toString() }
}

// an attestation object as an iOS install would make it: a fresh leaf key, the authenticator data over it, and a leaf
// certificate under an intermediate under the signing root, with the nonce in Apple's extension
function toTestAttestation({
	root,
	signingRoot = root,
	challenge = CHALLENGE,
	appId = APP_ID,
	counter = 0,
	aaguid = PRODUCTION_AAGUID,
}: AttestationOptions): { attestation: string; keyId: string } {
	// the leaf key, its key id, and the authenticator data that names it
	const leafKeys = generateKeyPairSync("ec", { namedCurve: "P-256" })
	const publicKeyPoint = toPublicKeyPoint(leafKeys.publicKey)
	const keyIdBytes = sha256(publicKeyPoint)
	const authData = toAuthData({ appId, counter, aaguid, keyIdBytes, publicKeyPoint })

	// the nonce over the authenticator data and the challenge's hash
	const nonce = sha256(Buffer.concat([authData, sha256(Buffer.from(challenge, "utf8"))]))

	// the intermediate under the signing root, and the leaf under the intermediate
	const intermediateKeys = generateKeyPairSync("ec", { namedCurve: "P-256" })
	const intermediateDer = toTestCertificateDer({
		subjectName: "Test Intermediate",
		issuerName: signingRoot.name,
		publicKey: intermediateKeys.publicKey,
		signingKey: signingRoot.keys.privateKey,
	})
	const leafDer = toTestCertificateDer({
		subjectName: "Test Leaf",
		issuerName: "Test Intermediate",
		publicKey: leafKeys.publicKey,
		signingKey: intermediateKeys.privateKey,
		extensions: [{ oid: APPLE_NONCE_EXTENSION_OID, value: toNonceExtensionValue(nonce) }],
	})

	// the attestation object, CBOR-encoded as the app sends it
	const attestationObject = {
		fmt: "apple-appattest",
		attStmt: { x5c: [new Uint8Array(leafDer), new Uint8Array(intermediateDer)], receipt: new Uint8Array() },
		authData: new Uint8Array(authData),
	}
	return {
		attestation: Buffer.from(encode(attestationObject)).toString("base64"),
		keyId: keyIdBytes.toString("base64"),
	}
}

// the authenticator data: the app id's hash, the flags, the counter, the aaguid, the credential id, and the COSE key
function toAuthData({
	appId,
	counter,
	aaguid,
	keyIdBytes,
	publicKeyPoint,
}: {
	appId: string
	counter: number
	aaguid: Buffer
	keyIdBytes: Buffer
	publicKeyPoint: Buffer
}): Buffer {
	// the counter and the credential id length as big-endian bytes
	const counterBytes = Buffer.alloc(4)
	counterBytes.writeUInt32BE(counter)
	const credentialIdLength = Buffer.alloc(2)
	credentialIdLength.writeUInt16BE(keyIdBytes.length)

	// the leaf key as a COSE EC2 key: kty, alg, crv, x, and y
	const coseKey = new Map<number, unknown>([
		[1, 2],
		[3, -7],
		[-1, 1],
		[-2, new Uint8Array(publicKeyPoint.subarray(1, 33))],
		[-3, new Uint8Array(publicKeyPoint.subarray(33, 65))],
	])
	return Buffer.concat([
		sha256(Buffer.from(appId, "utf8")),
		Buffer.from([0x41]),
		counterBytes,
		aaguid,
		credentialIdLength,
		keyIdBytes,
		Buffer.from(encode(coseKey)),
	])
}

// a P-256 public key as an uncompressed point: the 0x04 marker, then x and y
function toPublicKeyPoint(publicKey: KeyObject): Buffer {
	const { x, y } = publicKey.export({ format: "jwk" })
	return Buffer.concat([Buffer.from([0x04]), Buffer.from(x ?? "", "base64url"), Buffer.from(y ?? "", "base64url")])
}

// the SHA-256 digest of bytes
function sha256(bytes: Buffer): Buffer {
	return createHash("sha256").update(bytes).digest()
}
