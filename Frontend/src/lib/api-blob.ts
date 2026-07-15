import { apiFetchBlob } from "@/lib/api-client";

export async function downloadFile(path: string, filename: string): Promise<void> {
  const blob = await apiFetchBlob(path);
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function fetchImageObjectUrl(path: string): Promise<string> {
  const blob = await apiFetchBlob(path);
  return URL.createObjectURL(blob);
}
