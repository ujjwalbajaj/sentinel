import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type * as Koffi from "koffi";

const require = createRequire(import.meta.url);

const FILE_READ_DATA = 0x00000001;
const FILE_SHARE_READ = 0x00000001;
const FILE_SHARE_WRITE = 0x00000002;
const FILE_SHARE_DELETE = 0x00000004;
const OPEN_EXISTING = 3;
const FILE_ATTRIBUTE_NORMAL = 0x00000080;
const FILE_BEGIN = 0;

type Win32Read = {
  CreateFileW: (path: string, access: number, share: number, security: number, disposition: number, flags: number, template: number) => bigint | number;
  GetFileSizeEx: (handle: bigint | number, out: number[]) => boolean;
  SetFilePointerEx: (handle: bigint | number, offset: bigint, moved: number[], method: number) => boolean;
  ReadFile: (handle: bigint | number, buf: Buffer, length: number, read: number[], overlapped: number) => boolean;
  CloseHandle: (handle: bigint | number) => boolean;
};

let win32Read: Win32Read | null | undefined;

function loadWin32(): Win32Read | null {
  if (win32Read !== undefined) return win32Read;
  if (process.platform !== "win32") {
    win32Read = null;
    return null;
  }
  try {
    const koffi = require("koffi") as typeof Koffi;
    const kernel32 = koffi.load("kernel32.dll");
    win32Read = {
      CreateFileW: kernel32.func("intptr __stdcall CreateFileW(str16, uint32, uint32, intptr, uint32, uint32, intptr)"),
      GetFileSizeEx: kernel32.func("bool __stdcall GetFileSizeEx(intptr, _Out_ int64 *)"),
      SetFilePointerEx: kernel32.func("bool __stdcall SetFilePointerEx(intptr, int64, _Out_ int64 *, uint32)"),
      ReadFile: kernel32.func("bool __stdcall ReadFile(intptr, _Out_ uint8_t *, uint32, _Out_ uint32 *, intptr)"),
      CloseHandle: kernel32.func("bool __stdcall CloseHandle(intptr)"),
    };
    return win32Read;
  } catch {
    win32Read = null;
    return null;
  }
}

export interface SharedRead {
  size(): bigint;
  readAt(offset: number, length: number): Buffer;
  close(): void;
}

export function openSharedRead(path: string): SharedRead | null {
  const win32 = loadWin32();
  if (!win32) return openFs(path);
  const handle = win32.CreateFileW(
    path,
    FILE_READ_DATA,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    0,
    OPEN_EXISTING,
    FILE_ATTRIBUTE_NORMAL,
    0,
  );
  const value = BigInt(handle);
  if (value === 0n || value === 0xffffffffffffffffn || value === -1n) return null;
  return {
    size() {
      const out = [0];
      if (!win32.GetFileSizeEx(handle, out)) return 0n;
      return BigInt(out[0] ?? 0);
    },
    readAt(offset: number, length: number) {
      const moved = [0];
      if (!win32.SetFilePointerEx(handle, BigInt(offset), moved, FILE_BEGIN)) return Buffer.alloc(0);
      const buf = Buffer.alloc(length);
      const read = [0];
      if (!win32.ReadFile(handle, buf, length, read, 0)) return Buffer.alloc(0);
      return buf.subarray(0, read[0] ?? 0);
    },
    close() {
      win32.CloseHandle(handle);
    },
  };
}

function openFs(path: string): SharedRead | null {
  if (!readBytes(path)) return null;
  return {
    size() {
      const bytes = readBytes(path);
      return bytes ? BigInt(bytes.length) : 0n;
    },
    readAt(offset: number, length: number) {
      const bytes = readBytes(path);
      if (!bytes) return Buffer.alloc(0);
      return bytes.subarray(offset, offset + length);
    },
    close() {},
  };
}

function readBytes(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}
