import fs from "node:fs";
import { Readable } from "node:stream";
import { dataPath, getMediaByFilename } from "@/lib/db";

export const runtime = "nodejs";

// Public on purpose: Instagram and Facebook download files from this URL.
// File names are random UUIDs, so they cannot be guessed.
export async function GET(req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[0-9a-f-]{36}\.(jpg|png|mp4|mov)$/.test(file)) return new Response("Not found", { status: 404 });
  const media = getMediaByFilename(file);
  const filePath = dataPath("uploads", file);
  if (!media || !fs.existsSync(filePath)) return new Response("Not found", { status: 404 });

  const size = fs.statSync(filePath).size;
  const headers: Record<string, string> = {
    "Content-Type": media.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  const range = req.headers.get("range");
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
}
