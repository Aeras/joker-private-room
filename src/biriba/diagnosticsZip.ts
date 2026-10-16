/** Minimal ZIP (STORE) encoder; no dependencies, works in mobile browsers. */
const encoder = new TextEncoder();
const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

export function createDiagnosticZip(files: Record<string, string>): Blob {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  let directorySize = 0;
  const u16 = (view: DataView, pos: number, value: number) => view.setUint16(pos, value, true);
  const u32 = (view: DataView, pos: number, value: number) => view.setUint32(pos, value, true);
  for (const [filename, text] of Object.entries(files)) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) throw new Error("Invalid diagnostic filename");
    const name = encoder.encode(filename);
    const body = encoder.encode(text);
    const checksum = crc32(body);
    const header = new Uint8Array(30 + name.length);
    const h = new DataView(header.buffer);
    u32(h, 0, 0x04034b50); u16(h, 4, 20); u16(h, 6, 0x800);
    u16(h, 8, 0); u32(h, 14, checksum); u32(h, 18, body.length);
    u32(h, 22, body.length); u16(h, 26, name.length);
    header.set(name, 30);
    local.push(header, body);
    const descriptor = new Uint8Array(46 + name.length);
    const d = new DataView(descriptor.buffer);
    u32(d, 0, 0x02014b50); u16(d, 4, 20); u16(d, 6, 20);
    u16(d, 8, 0x800); u32(d, 16, checksum); u32(d, 20, body.length);
    u32(d, 24, body.length); u16(d, 28, name.length);
    u32(d, 42, offset); descriptor.set(name, 46);
    central.push(descriptor);
    offset += header.length + body.length;
    directorySize += descriptor.length;
  }
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  u32(e, 0, 0x06054b50); u16(e, 8, central.length);
  u16(e, 10, central.length); u32(e, 12, directorySize);
  u32(e, 16, offset);
  return new Blob([...local, ...central, end] as BlobPart[], { type: "application/zip" });
}
