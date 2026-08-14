/**
 * Session log reader: decode a DSH session artifact (plain .jsonl or
 * compressed .jsonl.zstd) into an ordered list of events, skipping packed
 * chunk rows and the header line.
 */

import { readFile } from 'node:fs/promises'
import { zstdDecompressSync } from 'node:zlib'

export interface SessionEvent {
  type: string
  seq: number
  time: number
  data: Record<string, unknown>
}

/** Zstandard frame magic `0xFD2FB528`, little-endian (bytes 28 B5 2F FD). */
const ZSTD_MAGIC = 4247762216

interface ZstdFrameRange {
  start: number
  end: number
}

function scanZstdFrames(buffer: Buffer): ZstdFrameRange[] {
  const frames: ZstdFrameRange[] = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) break
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      throw new Error(`corrupt Zstandard session log: invalid frame magic at byte ${offset}`)
    }
    offset += 4
    if (offset === buffer.length) break
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 24) !== 0) throw new Error('corrupt Zstandard session log: reserved frame-header bit')
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 32) !== 0
    const checksum = (descriptor & 4) !== 0
    const dictionaryFlag = descriptor & 3
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : (1 << contentSizeFlag)
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) break
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) return frames
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 3
      const blockSize = blockHeader >>> 3
      if (blockType === 3) throw new Error('corrupt Zstandard session log: reserved block type')
      const payloadBytes = blockType === 1 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return frames
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) return frames
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return frames
}

function decodeZstd(buffer: Buffer): string {
  const frames = scanZstdFrames(buffer)
  if (frames.length === 0) throw new Error('corrupt Zstandard session log: no complete frames')
  return Buffer.concat(frames.map((f) => zstdDecompressSync(buffer.subarray(f.start, f.end)))).toString('utf8')
}

export async function parseSessionFile(path: string): Promise<SessionEvent[]> {
  const buffer = await readFile(path)
  const isZstd = buffer.length >= 4 && buffer.readUInt32LE(0) === ZSTD_MAGIC
  const content = isZstd ? decodeZstd(buffer) : buffer.toString('utf8')
  const lines = content.trim().split('\n').filter((l) => l.length > 0)

  const events: SessionEvent[] = []
  for (let i = 1; i < lines.length; i++) {
    let parsed: unknown
    try {
      parsed = JSON.parse(lines[i])
    } catch {
      continue
    }
    if (isEventRecord(parsed)) events.push(parsed as SessionEvent)
  }
  return events
}

function isEventRecord(value: unknown): value is SessionEvent {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.type === 'string' &&
    typeof record.seq === 'number' &&
    typeof record.time === 'number' &&
    typeof record.data === 'object' &&
    record.data !== null
  )
}
