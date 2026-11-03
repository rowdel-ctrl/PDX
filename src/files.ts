import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function b64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const safe = (n: string) => (n.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'document') + '.pdf';

function browserDownload(bytes: Uint8Array, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Save into the phone's Documents folder. Returns a message for the user. */
export async function savePdf(bytes: Uint8Array, name: string): Promise<string> {
  const file = safe(name);
  if (!Capacitor.isNativePlatform()) { browserDownload(bytes, file); return `Downloaded ${file}`; }
  await Filesystem.writeFile({ path: `PDX/${file}`, data: b64(bytes), directory: Directory.Documents, recursive: true });
  return `Saved to Documents/PDX/${file}`;
}

export async function sharePdf(bytes: Uint8Array, name: string): Promise<void> {
  const file = safe(name);
  if (!Capacitor.isNativePlatform()) { browserDownload(bytes, file); return; }
  const r = await Filesystem.writeFile({ path: file, data: b64(bytes), directory: Directory.Cache });
  await Share.share({ title: file, files: [r.uri], dialogTitle: 'Share PDF' });
}

export interface OutFile { bytes: Uint8Array; name: string; mime: string }

/** Save several files (for example one picture per page) into Documents/PDX. */
export async function saveFiles(files: OutFile[]): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    files.forEach((f, i) => setTimeout(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: f.mime })); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }, i * 250));
    return `Downloaded ${files.length} ${files.length === 1 ? 'file' : 'files'}`;
  }
  for (const f of files) await Filesystem.writeFile({ path: `PDX/${f.name}`, data: b64(f.bytes), directory: Directory.Documents, recursive: true });
  return `Saved ${files.length} ${files.length === 1 ? 'file' : 'files'} to Documents/PDX`;
}

/** Open the phone's share sheet with several files. Apps such as Drive, Dropbox, WhatsApp and Email show up there when installed. */
export async function shareFiles(files: OutFile[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) { await saveFiles(files); return; }
  const uris: string[] = [];
  for (const f of files) uris.push((await Filesystem.writeFile({ path: f.name, data: b64(f.bytes), directory: Directory.Cache })).uri);
  await Share.share({ title: files[0]?.name, files: uris, dialogTitle: 'Share' });
}
