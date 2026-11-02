import { mediaPublicUrl, type Platform } from "./config";
import {
  all,
  dataPath,
  finalizePostStatus,
  getAccount,
  getPost,
  run,
  type PostTarget,
} from "./db";
import { publishers } from "./platforms";

async function publishTarget(postId: number, target: PostTarget) {
  const post = getPost(postId);
  const account = getAccount(target.account_id);
  if (!post || !account) return;

  run(`UPDATE post_targets SET status = 'publishing', error = NULL, note = NULL WHERE id = ?`, target.id);
  try {
    let options: Record<string, unknown> = {};
    try {
      options = JSON.parse(target.options || "{}");
    } catch {
      // ignore malformed options
    }
    const result = await publishers[account.platform as Platform]({
      account,
      caption: target.caption ?? post.caption,
      media: post.media,
      mediaPath: post.media ? dataPath("uploads", post.media.filename) : null,
      mediaUrl: post.media ? mediaPublicUrl(post.media.filename) : null,
      options,
    });
    run(
      `UPDATE post_targets SET status = 'published', external_id = ?, external_url = ?, note = ?, published_at = ? WHERE id = ?`,
      result.externalId ?? null,
      result.url ?? null,
      result.note ?? null,
      Date.now(),
      target.id,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[jarvis] publikacja ${account.platform} (post ${postId}) nie powiodła się:`, message);
    run(`UPDATE post_targets SET status = 'failed', error = ? WHERE id = ?`, message.slice(0, 2000), target.id);
  }
}

/** Publishes all pending targets of a post. The caller must have set the post to 'publishing'. */
export async function publishPost(postId: number) {
  const targets = all<PostTarget>(`SELECT * FROM post_targets WHERE post_id = ? AND status = 'pending'`, postId);
  await Promise.allSettled(targets.map((t) => publishTarget(postId, t)));
  finalizePostStatus(postId);
}
