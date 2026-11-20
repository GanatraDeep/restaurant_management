import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { closeSync, openSync, readSync, unlinkSync } from 'node:fs';
import type { Request } from 'express';
import { diskStorage, type FileFilterCallback } from 'multer';
import { uploadsDir } from '../../common/upload/image-upload.config';

// Voice notes for an SOP ("listen to the chef"): recorded in the browser
// (webm/ogg/mp4) or uploaded (mp3/m4a/wav). Served from /api/uploads/ like
// menu photos, so the bytes are checked against real audio signatures.
const EXT_BY_TYPE: Record<string, string> = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'video/webm': '.webm', // some browsers label recorded audio this way
};
const baseType = (t: string) => t.split(';')[0].trim().toLowerCase();

export const AUDIO_MAX_BYTES = 8 * 1024 * 1024;

export const audioUploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir()),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${EXT_BY_TYPE[baseType(file.mimetype)] ?? '.webm'}`),
  }),
  limits: { fileSize: AUDIO_MAX_BYTES, files: 1 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (!EXT_BY_TYPE[baseType(file.mimetype)]) {
      cb(new BadRequestException('Only audio files (mp3, m4a, wav, webm, ogg) are allowed'));
      return;
    }
    cb(null, true);
  },
};

export function isAudioSignature(b: Buffer): boolean {
  const ascii = (from: number, to: number) => b.subarray(from, to).toString('latin1');
  return (
    (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) || // WebM / Matroska
    ascii(0, 4) === 'OggS' ||
    ascii(4, 8) === 'ftyp' || // MP4 / M4A
    ascii(0, 3) === 'ID3' || // MP3 with tag
    (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) || // MP3 / AAC frame
    (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE')
  );
}

export function assertValidAudioSignature(filePath: string): void {
  const buf = Buffer.alloc(12);
  const fd = openSync(filePath, 'r');
  try {
    readSync(fd, buf, 0, 12, 0);
  } finally {
    closeSync(fd);
  }
  if (!isAudioSignature(buf)) {
    try { unlinkSync(filePath); } catch { /* already gone */ }
    throw new BadRequestException('That file is not a playable audio recording');
  }
}
