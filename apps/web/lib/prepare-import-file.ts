/** Prepare a statement file for upload to Vercel (≈4.5MB body hard cap). */
const VERCEL_SAFE_MAX = 3.5 * 1024 * 1024;

function isImageFile(file: File) {
  return (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif)$/i.test(file.name)
  );
}

async function canvasToJpegBlob(
  bitmap: ImageBitmap,
  quality: number,
  maxEdge: number,
): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("לא ניתן לדחוס תמונה במכשיר זה");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("דחיסת תמונה נכשלה");
  return blob;
}

async function compressImage(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function") return file;
  const bitmap = await createImageBitmap(file);
  try {
    let quality = 0.82;
    let maxEdge = 1800;
    let blob = await canvasToJpegBlob(bitmap, quality, maxEdge);
    while (blob.size > VERCEL_SAFE_MAX && (quality > 0.45 || maxEdge > 900)) {
      if (quality > 0.45) quality -= 0.12;
      else maxEdge = Math.round(maxEdge * 0.75);
      blob = await canvasToJpegBlob(bitmap, quality, maxEdge);
    }
    const base = file.name.replace(/\.[^.]+$/, "") || "statement";
    return new File([blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close?.();
  }
}

/**
 * Shrink phone photos so multipart stays under Vercel’s request body limit.
 * CSV/PDF pass through (with a hard size check).
 */
export async function prepareImportFile(file: File): Promise<File> {
  let next = file;
  if (isImageFile(file) && file.size > 900_000) {
    try {
      next = await compressImage(file);
    } catch {
      next = file;
    }
  }
  if (next.size > VERCEL_SAFE_MAX) {
    throw new Error(
      "הקובץ גדול מדי לשליחה מהטלפון (מקסימום כ־3.5MB אחרי דחיסה). נסו CSV או תמונה קטנה יותר.",
    );
  }
  return next;
}
