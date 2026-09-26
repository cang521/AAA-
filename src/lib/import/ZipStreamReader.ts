/**
 * ZipStreamReader.ts
 * Memory-efficient ZIP file reader using Blob slicing and Central Directory parsing.
 * Reads ZIP metadata without loading the entire archive into memory.
 */

export interface ZipEntry {
  filename: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number; // 0 = Store, 8 = Deflate
  localHeaderOffset: number;
  isDirectory: boolean;
}

export class ZipStreamReader {
  private file: File | Blob;
  private entries: Map<string, ZipEntry> = new Map();
  private parsed: boolean = false;

  constructor(file: File | Blob) {
    this.file = file;
  }

  /**
   * Parse Central Directory from the end of the ZIP file
   */
  public async parseCentralDirectory(): Promise<ZipEntry[]> {
    if (this.parsed) {
      return Array.from(this.entries.values());
    }

    const fileSize = this.file.size;
    if (fileSize < 22) {
      throw new Error('ZIP 文件太小，并非有效的 ZIP 压缩包');
    }

    // EOCD (End of Central Directory) record is at most 65557 bytes from the end
    const searchSize = Math.min(fileSize, 65557);
    const bufferSlice = await this.file.slice(fileSize - searchSize, fileSize).arrayBuffer();
    const view = new DataView(bufferSlice);

    let eocdOffset = -1;
    // Search backwards for EOCD signature 0x06054b50 (PK\x05\x06)
    for (let i = bufferSlice.byteLength - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new Error('未找到 ZIP Central Directory，文件格式不完整或损坏');
    }

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const cdSize = view.getUint32(eocdOffset + 12, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);

    // Read Central Directory entries
    const cdSlice = await this.file.slice(cdOffset, cdOffset + cdSize).arrayBuffer();
    const cdView = new DataView(cdSlice);
    const decoder = new TextDecoder('utf-8');

    let pos = 0;
    for (let i = 0; i < totalEntries && pos < cdSlice.byteLength; i++) {
      if (cdView.getUint32(pos, true) !== 0x02014b50) {
        break; // End of entries or malformed
      }

      const compressionMethod = cdView.getUint16(pos + 10, true);
      const compressedSize = cdView.getUint32(pos + 20, true);
      const uncompressedSize = cdView.getUint32(pos + 24, true);
      const filenameLen = cdView.getUint16(pos + 28, true);
      const extraLen = cdView.getUint16(pos + 30, true);
      const commentLen = cdView.getUint16(pos + 32, true);
      const localHeaderOffset = cdView.getUint32(pos + 42, true);

      const filenameBytes = new Uint8Array(cdSlice, pos + 46, filenameLen);
      const filename = decoder.decode(filenameBytes);
      const isDirectory = filename.endsWith('/');

      const entry: ZipEntry = {
        filename,
        compressedSize,
        uncompressedSize,
        compressionMethod,
        localHeaderOffset,
        isDirectory,
      };

      this.entries.set(filename, entry);
      pos += 46 + filenameLen + extraLen + commentLen;
    }

    this.parsed = true;
    return Array.from(this.entries.values());
  }

  /**
   * Extract text of a single entry by slicing only its compressed bytes from the file
   */
  public async readEntryText(entry: ZipEntry): Promise<string> {
    if (entry.isDirectory) return '';

    // Read local header to find exact start of compressed data
    // Local header length = 30 + filenameLen + extraLen
    const localHeaderSlice = await this.file
      .slice(entry.localHeaderOffset, entry.localHeaderOffset + 30)
      .arrayBuffer();
    const localView = new DataView(localHeaderSlice);

    if (localView.getUint32(0, true) !== 0x04034b50) {
      throw new Error(`损坏的 ZIP 本地标头: ${entry.filename}`);
    }

    const filenameLen = localView.getUint16(26, true);
    const extraLen = localView.getUint16(28, true);
    const dataStart = entry.localHeaderOffset + 30 + filenameLen + extraLen;

    // Slice ONLY the compressed data block for this entry
    const compressedBlob = this.file.slice(dataStart, dataStart + entry.compressedSize);

    if (entry.compressionMethod === 0) {
      // Store (Uncompressed)
      return await compressedBlob.text();
    } else if (entry.compressionMethod === 8) {
      // Deflate
      return await this.decompressDeflateBlob(compressedBlob);
    } else {
      throw new Error(`暂不支持的 ZIP 压缩算法: ${entry.compressionMethod}`);
    }
  }

  /**
   * Decompress a deflate compressed Blob using native browser DecompressionStream
   */
  private async decompressDeflateBlob(blob: Blob): Promise<string> {
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const stream = blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const decompressedArrayBuffer = await new Response(stream).arrayBuffer();
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(decompressedArrayBuffer);
      } catch (e) {
        // Fallback if deflate-raw failed or header variations
        try {
          const stream = blob.stream().pipeThrough(new DecompressionStream('deflate'));
          const decompressedArrayBuffer = await new Response(stream).arrayBuffer();
          const decoder = new TextDecoder('utf-8');
          return decoder.decode(decompressedArrayBuffer);
        } catch (e2) {
          console.warn('Native DecompressionStream failed, using fallback', e2);
        }
      }
    }

    // Fallback using JSZip for single-blob decompression if DecompressionStream is unavailable
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const unzipped = await zip.loadAsync(blob);
    const firstKey = Object.keys(unzipped.files)[0];
    if (firstKey) {
      return await unzipped.files[firstKey].async('text');
    }
    return '';
  }

  public getEntries(): ZipEntry[] {
    return Array.from(this.entries.values());
  }
}
