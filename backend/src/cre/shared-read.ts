import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { createRequire } from "node:module";
import type * as Koffi from "koffi";

const require = createRequire(import.meta.url);
const koffi = require("koffi") as typeof Koffi;

const FILE_READ_DATA = 0x00000001;
const FILE_SHARE_READ = 0x00000001;
const FILE_SHARE_WRITE = 0x00000002;
const FILE_SHARE_DELETE = 0x00000004;
const OPEN_EXISTING = 3;
const FILE_ATTRIBUTE_NORMAL = 0x00000080;
const FILE_BEGIN = 0;

const kernel32 = koffi.load("kernel32.dll");
const CreateFileW = kernel32.func("intptr __stdcall CreateFileW(str16, uint32, uint32, intptr, uint32, uint32, intptr)");
const GetFileSizeEx = kernel32.func("bool __stdcall GetFileSizeEx(intptr, _Out_ int64 *)");
const SetFilePointerEx = kernel32.func("bool __stdcall SetFilePointerEx(intptr, int64, _Out_ int64 *, uint32)");
const ReadFile = kernel32.func("bool __stdcall ReadFile(intptr, _Out_ uint8_t *, uint32, _Out_ uint32 *, intptr)");
const CloseHandle = kernel32.func("bool __stdcall CloseHandle(intptr)");

export interface SharedRead {
  size(): bigint;
  readAt(offset: number, length: number): Buffer;
  close(): void;
}

export function openSharedRead(path: string): SharedRead | null {
  if (process.platform !== "win32") return openPosix(path);
  const handle = CreateFileW(
    path,
    FILE_READ_DATA,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    0,
    OPEN_EXISTING,
    FILE_ATTRIBUTE_NORMAL,
    0,
  ) as bigint | number;
  const value = BigInt(handle);
  if (value === 0n || value === 0xffffffffffffffffn || value === -1n) return null;
  return {
    size() {
      const out = [0];
      if (!GetFileSizeEx(handle, out)) return 0n;
      return BigInt(out[0] ?? 0);
    },
    readAt(offset: number, length: number) {
      const moved = [0];
      if (!SetFilePointerEx(handle, BigInt(offset), moved, FILE_BEGIN)) return Buffer.alloc(0);
      const buf = Buffer.alloc(length);
      const read = [0];
      if (!ReadFile(handle, buf, length, read, 0)) return Buffer.alloc(0);
      return buf.subarray(0, read[0] ?? 0);
    },
    close() {
      CloseHandle(handle);
    },
  };
}

function openPosix(path: string): SharedRead | null {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return null;
  }
  return {
    size() {
      return BigInt(fstatSync(fd).size);
    },
    readAt(offset: number, length: number) {
      const buf = Buffer.alloc(length);
      const read = readSync(fd, buf, 0, length, offset);
      return buf.subarray(0, read);
    },
    close() {
      closeSync(fd);
    },
  };
}
