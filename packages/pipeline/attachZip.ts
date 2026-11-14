// a zipped document's directory: the entries a Word file or a workbook declares, read without unpacking any of them
import { AttachmentValidationError } from "./attachContentType"

// the most bytes a Word file or a workbook may declare that it unpacks to. the largest file a chat takes is under
// 20 MB, and the Word files and workbooks measured unpack to 4 to 7 times their size, so a real document declares far
// less
export const MAX_ZIP_UNPACKED_BYTES = 1024 * 1024 * 1024

// one entry of a zip's directory: its name, how its data is packed, the data's checksum, its packed and unpacked
// sizes, and where its record starts in the file
export type ZipEntry = {
	name: string
	compressionMethod: number
	checksum: number
	packedByteSize: number
	unpackedByteSize: number
	recordOffset: number
}

// a kind of zip record: the signature it starts with, and how many fixed bytes it starts with
type ZipRecordKind = { signature: number; byteSize: number }

// the record that ends a zip, which names where the directory starts: the bytes it starts with, and how many fixed
// bytes it has
export const ZIP_END_RECORD_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x05, 0x06])
export const ZIP_END_RECORD_BYTES = 22

// the two records before the end record of a zip that holds a size, a count, or an offset past what the end record's
// own fields hold
const ZIP64_LOCATOR: ZipRecordKind = { signature: 0x07064b50, byteSize: 20 }
const ZIP64_END_RECORD: ZipRecordKind = { signature: 0x06064b50, byteSize: 56 }

// the value that marks the end record's entry count as held by the zip64 end record
const ZIP64_COUNT_MARKER = 0xffff

// a directory entry, and the record before an entry's own data
export const ZIP_DIRECTORY_ENTRY: ZipRecordKind = { signature: 0x02014b50, byteSize: 46 }
const ENTRY_RECORD: ZipRecordKind = { signature: 0x04034b50, byteSize: 30 }

// the extra field that holds an entry's sizes and offset past four gigabytes, and the value that marks each of them
const ZIP64_EXTRA_FIELD_ID = 0x0001
const ZIP64_MARKER = 0xffffffff

// the zip version a record names as needed to unpack it, the one that reads packed data
const ZIP_VERSION = 20

// how a record marks data that is stored as written, with no packing
const STORED_COMPRESSION_METHOD = 0

// how many bytes of packed data one piece of a record holds
const RECORD_PIECE_BYTES = 64 * 1024

/**
 * Reads a zip's directory and returns its entries, with no entry unpacked. Rejects a file that is not a zip, a file
 * whose directory does not hold every entry it declares, and a file whose entries declare more unpacked bytes than a
 * real document holds.
 */
export function readZipEntries(bytes: Uint8Array): ZipEntry[] {
	// walk every entry the directory declares. a declared entry that does not read as one is no zip's
	const view = toDataView(bytes)
	const { directoryOffset, entryCount, prefixByteSize } = readDirectory(view)
	const zipEntries: ZipEntry[] = []
	let unpackedByteSize = 0
	let entryOffset = directoryOffset

	// each declared entry starts where the one before it ended
	for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
		if (!isRecordAt({ view, offset: entryOffset, recordKind: ZIP_DIRECTORY_ENTRY })) {
			throw toNotZipError()
		}

		// read the entry, and go on to where the next one starts
		const { zipEntry, nextEntryOffset } = readDirectoryEntry({ view, entryOffset, prefixByteSize })
		zipEntries.push(zipEntry)
		entryOffset = nextEntryOffset

		// reject the file once its declared unpacked size passes the limit
		unpackedByteSize += zipEntry.unpackedByteSize
		if (unpackedByteSize > MAX_ZIP_UNPACKED_BYTES) {
			throw new AttachmentValidationError(`the file declares more than ${MAX_ZIP_UNPACKED_BYTES} unpacked bytes`)
		}
	}
	return zipEntries
}

/**
 * Returns an entry as the record a streaming unzip reads: a header that names the entry's sizes, then its packed data
 * in pieces, which are views of the file's own bytes.
 */
export function toZipEntryRecord(bytes: Uint8Array, zipEntry: ZipEntry): Uint8Array[] {
	// the packed data in pieces small enough that the unzip never holds a whole entry
	const packedData = readZipEntryData(bytes, zipEntry)
	const record = [toRecordHeader(zipEntry)]
	for (let pieceOffset = 0; pieceOffset < packedData.byteLength; pieceOffset += RECORD_PIECE_BYTES) {
		record.push(packedData.subarray(pieceOffset, pieceOffset + RECORD_PIECE_BYTES))
	}
	return record
}

/**
 * Returns the record a streaming unzip reads as an entry of the given name that holds the bytes as written, unpacked.
 */
export function toStoredZipRecord(name: string, storedBytes: Uint8Array): Uint8Array[] {
	const header = toRecordHeader({
		name,
		compressionMethod: STORED_COMPRESSION_METHOD,
		checksum: Bun.hash.crc32(storedBytes),
		packedByteSize: storedBytes.byteLength,
		unpackedByteSize: storedBytes.byteLength,
	})
	return [header, storedBytes]
}

// the header of an entry's record: its fixed bytes, then the entry's name, with no extra field
function toRecordHeader(zipEntry: Omit<ZipEntry, "recordOffset">): Uint8Array {
	const nameBytes = new TextEncoder().encode(zipEntry.name)
	const header = new Uint8Array(ENTRY_RECORD.byteSize + nameBytes.byteLength)
	const headerView = toDataView(header)
	header.set(nameBytes, ENTRY_RECORD.byteSize)

	// the signature, the zip version, and how the data is packed
	headerView.setUint32(0, ENTRY_RECORD.signature, true)
	headerView.setUint16(4, ZIP_VERSION, true)
	headerView.setUint16(8, zipEntry.compressionMethod, true)

	// the data's checksum, its packed and unpacked sizes, and the name's length
	headerView.setUint32(14, zipEntry.checksum, true)
	headerView.setUint32(18, zipEntry.packedByteSize, true)
	headerView.setUint32(22, zipEntry.unpackedByteSize, true)
	headerView.setUint16(26, nameBytes.byteLength, true)
	return header
}

// a view that reads the bytes' numbers
function toDataView(bytes: Uint8Array): DataView {
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

// a zip's directory: where it starts in the file, how many entries it declares, and how many bytes the file holds
// before the zip, which every offset the zip names leaves out
type ZipDirectory = { directoryOffset: number; entryCount: number; prefixByteSize: number }

// the directory the record that ends the zip names. a file may hold other bytes before its zip, as a reader of Word
// files and workbooks allows, so the directory is found from where it ends and not from the offset the zip names
function readDirectory(view: DataView): ZipDirectory {
	// a directory the end record's own fields can hold is named by the end record, and ends where that record starts
	const endRecordOffset = findEndRecordOffset(view)
	const declaredDirectory = {
		entryCount: view.getUint16(endRecordOffset + 10, true),
		byteSize: view.getUint32(endRecordOffset + 12, true),
		offset: view.getUint32(endRecordOffset + 16, true),
	}

	// a count, a size, or an offset past what those fields hold is marked, and the zip64 end record holds it
	const isZip64 =
		declaredDirectory.entryCount === ZIP64_COUNT_MARKER ||
		declaredDirectory.byteSize === ZIP64_MARKER ||
		declaredDirectory.offset === ZIP64_MARKER
	return isZip64
		? readZip64Directory(view, endRecordOffset)
		: toZipDirectory({ ...declaredDirectory, endOffset: endRecordOffset })
}

// a larger directory is named by the zip64 end record, which sits right before the locator that precedes the end
// record, and the directory ends where the zip64 end record starts
function readZip64Directory(view: DataView, endRecordOffset: number): ZipDirectory {
	const zip64EndRecordOffset = endRecordOffset - ZIP64_LOCATOR.byteSize - ZIP64_END_RECORD.byteSize
	const isZip64 =
		isRecordAt({ view, offset: endRecordOffset - ZIP64_LOCATOR.byteSize, recordKind: ZIP64_LOCATOR }) &&
		isRecordAt({ view, offset: zip64EndRecordOffset, recordKind: ZIP64_END_RECORD })
	if (!isZip64) {
		throw toNotZipError()
	}

	// the zip64 end record names the entry count, the directory's size, and its offset in eight bytes each
	return toZipDirectory({
		entryCount: Number(view.getBigUint64(zip64EndRecordOffset + 32, true)),
		byteSize: Number(view.getBigUint64(zip64EndRecordOffset + 40, true)),
		offset: Number(view.getBigUint64(zip64EndRecordOffset + 48, true)),
		endOffset: zip64EndRecordOffset,
	})
}

// what a zip declares of its directory, and where the directory ends in the file
type DeclaredZipDirectory = { entryCount: number; byteSize: number; offset: number; endOffset: number }

// the directory, which starts its declared size before its end. the bytes between that start and the offset the zip
// names are the bytes before the zip, and a directory that would start before the offset it names is no zip's
function toZipDirectory({ entryCount, byteSize, offset, endOffset }: DeclaredZipDirectory): ZipDirectory {
	const directoryOffset = endOffset - byteSize
	const prefixByteSize = directoryOffset - offset
	if (prefixByteSize < 0) {
		throw toNotZipError()
	}
	return { directoryOffset, entryCount, prefixByteSize }
}

// where the record that ends the zip starts: the last place in the file its signature is found with the record's
// comment running to the file's end, because the comment itself may hold the signature. a file that other bytes
// follow has no such place, and its end record is the last signature with all its fixed bytes inside the file
function findEndRecordOffset(view: DataView): number {
	const fileBytes = Buffer.from(view.buffer, view.byteOffset, view.byteLength)
	let lastRecordOffset = -1
	let signatureOffset = fileBytes.lastIndexOf(ZIP_END_RECORD_SIGNATURE)

	// walk the signatures from the last one back
	while (signatureOffset >= 0) {
		const commentOffset = signatureOffset + ZIP_END_RECORD_BYTES
		if (commentOffset <= view.byteLength) {
			// the record's last two fixed bytes name its comment's length
			if (commentOffset + view.getUint16(commentOffset - 2, true) === view.byteLength) {
				return signatureOffset
			}
			lastRecordOffset = Math.max(lastRecordOffset, signatureOffset)
		}
		signatureOffset = signatureOffset > 0 ? fileBytes.lastIndexOf(ZIP_END_RECORD_SIGNATURE, signatureOffset - 1) : -1
	}

	// no record's comment runs to the file's end
	if (lastRecordOffset < 0) {
		throw toNotZipError()
	}
	return lastRecordOffset
}

// a record to look for: the bytes, where it would start, and its kind
type IsRecordAtOptions = { view: DataView; offset: number; recordKind: ZipRecordKind }

// whether a record of the kind starts at the offset, with all its fixed bytes inside the file
function isRecordAt({ view, offset, recordKind }: IsRecordAtOptions): boolean {
	const isRecordInside = offset >= 0 && offset + recordKind.byteSize <= view.byteLength
	return isRecordInside && view.getUint32(offset, true) === recordKind.signature
}

// the rejection of a file whose bytes do not read as a zip
function toNotZipError(): AttachmentValidationError {
	return new AttachmentValidationError("the file is not a zip")
}

// a directory entry to read: the bytes, where the entry starts, and how many bytes the file holds before the zip
type ReadDirectoryEntryOptions = { view: DataView; entryOffset: number; prefixByteSize: number }

// one directory entry, with its record's offset counted from the start of the file, and where the next one starts
function readDirectoryEntry({ view, entryOffset, prefixByteSize }: ReadDirectoryEntryOptions): {
	zipEntry: ZipEntry
	nextEntryOffset: number
} {
	// the lengths of the name, the extra field, and the comment that follow the fixed bytes
	const nameByteSize = view.getUint16(entryOffset + 28, true)
	const extraByteSize = view.getUint16(entryOffset + 30, true)
	const commentByteSize = view.getUint16(entryOffset + 32, true)
	const nameOffset = entryOffset + ZIP_DIRECTORY_ENTRY.byteSize
	const nextEntryOffset = nameOffset + nameByteSize + extraByteSize + commentByteSize
	if (nextEntryOffset > view.byteLength) {
		throw toNotZipError()
	}

	// the sizes and the offset as the fixed bytes declare them, which the zip64 extra field may replace
	const declaredSizes = {
		packedByteSize: view.getUint32(entryOffset + 20, true),
		unpackedByteSize: view.getUint32(entryOffset + 24, true),
		recordOffset: view.getUint32(entryOffset + 42, true),
	}
	const zipEntrySizes = readZip64Sizes({ view, declaredSizes, extraOffset: nameOffset + nameByteSize, extraByteSize })

	// the entry, with its name decoded
	const nameBytes = new Uint8Array(view.buffer, view.byteOffset + nameOffset, nameByteSize)
	const zipEntry: ZipEntry = {
		name: new TextDecoder().decode(nameBytes),
		compressionMethod: view.getUint16(entryOffset + 10, true),
		checksum: view.getUint32(entryOffset + 16, true),
		...zipEntrySizes,
		recordOffset: zipEntrySizes.recordOffset + prefixByteSize,
	}
	return { zipEntry, nextEntryOffset }
}

// the sizes and the offset a directory entry may mark as past four gigabytes
type ZipEntrySizes = Pick<ZipEntry, "packedByteSize" | "unpackedByteSize" | "recordOffset">

// a directory entry's extra fields to search: the bytes, the sizes its fixed bytes declare, and where the extra
// fields start and how long they run
type ReadZip64SizesOptions = {
	view: DataView
	declaredSizes: ZipEntrySizes
	extraOffset: number
	extraByteSize: number
}

// an entry's sizes and offset, with each one marked as past four gigabytes read from the zip64 extra field. the
// field holds only the marked ones, in this order: the unpacked size, the packed size, and the record's offset
function readZip64Sizes({ view, declaredSizes, extraOffset, extraByteSize }: ReadZip64SizesOptions): ZipEntrySizes {
	// find the zip64 field among the extra fields, each an id and a size before its data
	const extraEnd = extraOffset + extraByteSize
	let fieldOffset = extraOffset
	while (fieldOffset + 4 <= extraEnd && view.getUint16(fieldOffset, true) !== ZIP64_EXTRA_FIELD_ID) {
		fieldOffset += 4 + view.getUint16(fieldOffset + 2, true)
	}
	if (fieldOffset + 4 > extraEnd) {
		return declaredSizes
	}

	// the field's own end, where its next value starts, and the sizes to fill in
	const fieldEnd = Math.min(extraEnd, fieldOffset + 4 + view.getUint16(fieldOffset + 2, true))
	let valueOffset = fieldOffset + 4
	const zipEntrySizes = { ...declaredSizes }

	// read eight bytes for each marked value, as far as the field runs
	for (const sizeKey of ["unpackedByteSize", "packedByteSize", "recordOffset"] as const) {
		if (declaredSizes[sizeKey] === ZIP64_MARKER && valueOffset + 8 <= fieldEnd) {
			zipEntrySizes[sizeKey] = Number(view.getBigUint64(valueOffset, true))
			valueOffset += 8
		}
	}
	return zipEntrySizes
}

// an entry's packed data, a view of the file's own bytes after the record that starts the entry
function readZipEntryData(bytes: Uint8Array, zipEntry: ZipEntry): Uint8Array {
	// the record before the data starts where the directory says
	const view = toDataView(bytes)
	const { recordOffset } = zipEntry
	if (!isRecordAt({ view, offset: recordOffset, recordKind: ENTRY_RECORD })) {
		throw toNotZipError()
	}

	// the data follows the record's own name and extra field, whose lengths the record names
	const nameByteSize = view.getUint16(recordOffset + 26, true)
	const extraByteSize = view.getUint16(recordOffset + 28, true)
	const dataOffset = recordOffset + ENTRY_RECORD.byteSize + nameByteSize + extraByteSize
	if (dataOffset + zipEntry.packedByteSize > bytes.byteLength) {
		throw toNotZipError()
	}
	return bytes.subarray(dataOffset, dataOffset + zipEntry.packedByteSize)
}
