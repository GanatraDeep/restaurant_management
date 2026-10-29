import { ApiError } from "@/lib/api";

/**
 * Fetch a file from the API and hand it to the browser as a download, so
 * errors can be shown as a toast instead of a page of JSON.
 */
export async function downloadFile(path: string, fallbackName: string, body?: unknown) {
  const res = await fetch(`/api/v1${path}`, {
    credentials: "include",
    ...(body !== undefined
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(err.message ?? "Download failed", res.status);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename="([^"]+)"/i.exec(disposition)?.[1];
  const name = encoded ? decodeURIComponent(encoded) : (plain ?? fallbackName);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
