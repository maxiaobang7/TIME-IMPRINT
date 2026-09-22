// Canvas exports have browser-dependent density metadata. Declare the same
// 300 DPI used by the paper layout without altering the encoded image pixels.
export async function withPrintDensity(blob: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (blob.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let position = 2;
    while (position + 16 < bytes.length && bytes[position] === 0xff) {
      const marker = bytes[position + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const length = bytes[position + 2] * 256 + bytes[position + 3];
      if (length < 2) break;
      if (marker === 0xe0 && String.fromCharCode(...bytes.slice(position + 4, position + 9)) === "JFIF\0") {
        bytes.set([1, 1, 44, 1, 44], position + 11);
        return new Blob([bytes], { type: blob.type });
      }
      position += length + 2;
    }
    const header = new Uint8Array([255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, 1, 44, 1, 44, 0, 0]);
    return new Blob([bytes.slice(0, 2), header, bytes.slice(2)], { type: blob.type });
  }
  if (blob.type === "image/png" && bytes[0] === 137 && bytes[1] === 80) {
    const parts: BlobPart[] = [bytes.slice(0, 8)];
    const density = new Uint8Array(21);
    const view = new DataView(density.buffer);
    view.setUint32(0, 9);
    density.set([112, 72, 89, 115], 4);
    view.setUint32(8, 11811);
    view.setUint32(12, 11811);
    density[16] = 1;
    view.setUint32(17, crc32(density.slice(4, 17)));
    let inserted = false;
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = new DataView(bytes.buffer).getUint32(offset);
      if (offset + length + 12 > bytes.length) return blob;
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      if (type === "IDAT" && !inserted) { parts.push(density); inserted = true; }
      if (type !== "pHYs") parts.push(bytes.slice(offset, offset + length + 12));
      offset += length + 12;
    }
    return new Blob(parts, { type: blob.type });
  }
  return blob;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
