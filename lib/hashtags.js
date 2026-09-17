export function extractHashtags(caption) {
  if (!caption) return [];
  const matches = caption.match(/#[a-zA-Z0-9_]+/g) || [];
  return [...new Set(matches.map((tag) => tag.slice(1).toLowerCase()))];
}