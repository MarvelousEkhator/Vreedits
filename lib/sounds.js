import { prisma } from "@/lib/prisma";

// Makes sure a Sound record exists for this id. Older sounds were just a
// post id, so the first time one is touched it gets a real Sound record
// (with the SAME id, so nothing that already points at it breaks).
export async function ensureSound(id, depth = 0) {
  if (!id || depth > 3) return null;

  const existing = await prisma.sound.findUnique({ where: { id } });
  if (existing) return existing;

  const post = await prisma.feedPost.findUnique({
    where: { id },
    select: { id: true, authorId: true, mediaType: true, soundId: true },
  });
  if (!post || post.mediaType !== "video") return null;

  // This video reuses someone else's sound, so follow it back to the original.
  if (post.soundId && post.soundId !== post.id) {
    return ensureSound(post.soundId, depth + 1);
  }

  try {
    return await prisma.sound.create({
      data: { id: post.id, authorId: post.authorId, sourcePostId: post.id },
    });
  } catch {
    return prisma.sound.findUnique({ where: { id } });
  }
}

// Returns the Sound the viewer is allowed to see, or null.
export async function resolveSound(id, viewerId) {
  const sound = await ensureSound(id);
  if (!sound) return null;

  if (sound.sourcePostId) {
    const src = await prisma.feedPost.findUnique({
      where: { id: sound.sourcePostId },
      select: { authorId: true, isPrivate: true, isDraft: true },
    });
    if (src) {
      if ((src.isPrivate || src.isDraft) && src.authorId !== viewerId) return null;
    } else if (!sound.mediaUrl) {
      return null;
    }
  }
  return sound;
}

// Call this BEFORE deleting a post. If other videos use this post's sound,
// the audio is copied onto the Sound so it survives. If nobody else uses it,
// the sound (and its favorites) are removed.
export async function releaseSoundForPost(post) {
  if (post.mediaType !== "video") return;
  if (post.soundId && post.soundId !== post.id) return;

  const sound = await ensureSound(post.id);
  if (!sound || sound.sourcePostId !== post.id) return;

  const uses = await prisma.feedPost.count({
    where: { soundId: sound.id, id: { not: post.id } },
  });

  if (uses > 0) {
    await prisma.sound.update({
      where: { id: sound.id },
      data: { mediaUrl: post.mediaUrl, sourcePostId: null },
    });
  } else {
    await prisma.favoriteSound.deleteMany({ where: { soundId: sound.id } });
    await prisma.sound.delete({ where: { id: sound.id } });
  }
}