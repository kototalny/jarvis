import crypto from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { mediaPublicUrl } from "@/lib/config";
import { dataPath, run, type MediaKind } from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";

const ALLOWED: Record<string, { ext: string; kind: MediaKind }> = {
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/png": { ext: "png", kind: "image" },
  "video/mp4": { ext: "mp4", kind: "video" },
  "video/quicktime": { ext: "mov", kind: "video" },
};
const MAX_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB

/** Raw upload: body = file bytes, headers: Content-Type, X-Filename (URI-encoded). */
export async function POST(req: Request) {
  if (!(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value))) {
    return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });
  }
  const mime = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const type = ALLOWED[mime];
  if (!type) {
    return NextResponse.json({ error: "Dozwolone pliki: JPG, PNG, MP4, MOV." }, { status: 415 });
  }
  if (!req.body) return NextResponse.json({ error: "Pusty plik." }, { status: 400 });

  const originalName = decodeURIComponent(req.headers.get("x-filename") || "plik").slice(0, 200);
  const id = crypto.randomUUID();
  const filename = `${id}.${type.ext}`;
  const target = dataPath("uploads", filename);

  let size = 0;
  const counter = async function* (source: AsyncIterable<Uint8Array>) {
    for await (const chunk of source) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new Error("Plik jest za duży (limit 4 GB).");
      yield chunk;
    }
  };
  try {
    await pipeline(Readable.fromWeb(req.body as any), counter, fs.createWriteStream(target));
  } catch (e) {
    fs.rmSync(target, { force: true });
    return NextResponse.json({ error: (e as Error).message || "Błąd zapisu pliku." }, { status: 400 });
  }
  if (size === 0) {
    fs.rmSync(target, { force: true });
    return NextResponse.json({ error: "Pusty plik." }, { status: 400 });
  }

  run(
    `INSERT INTO media (id, filename, original_name, mime, size, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    filename,
    originalName,
    mime,
    size,
    type.kind,
    Date.now(),
  );
  return NextResponse.json({ id, kind: type.kind, mime, size, url: mediaPublicUrl(filename), path: `/media/${filename}` });
}
