import { prisma } from "@/lib/prisma";

// Checks a message against a community's enabled AutoMod rules.
// Returns { blocked, flagged, rule, message }.
export async function runAutoMod(communityId, content) {
  const rules = await prisma.autoModRule.findMany({
    where: { communityId, enabled: true },
  });
  const text = String(content || "");
  const lower = text.toLowerCase();

  for (const rule of rules) {
    const cfg = rule.config || {};
    let hit = false;

    if (rule.type === "keywords") {
      const words = Array.isArray(cfg.words) ? cfg.words : [];
      hit = words.some((w) => w && lower.includes(String(w).toLowerCase()));
    } else if (rule.type === "links") {
      const links = text.match(/(?:https?:\/\/|www\.)[^\s]+/gi) || [];
      const allowed = Array.isArray(cfg.allowedDomains)
        ? cfg.allowedDomains.map((d) => String(d).toLowerCase())
        : [];
      hit = links.some((l) => !allowed.some((d) => l.toLowerCase().includes(d)));
    } else if (rule.type === "caps") {
      const letters = text.replace(/[^a-zA-Z]/g, "");
      if (letters.length >= 8) {
        const upper = letters.replace(/[^A-Z]/g, "").length;
        hit = (upper / letters.length) * 100 >= (Number(cfg.maxPercent) || 70);
      }
    } else if (rule.type === "mentions") {
      const count = (text.match(/@\w+/g) || []).length;
      hit = count > (Number(cfg.max) || 5);
    } else if (rule.type === "spam") {
      const max = Number(cfg.maxRepeat) || 6;
      hit = new RegExp("(.)\\1{" + max + ",}").test(text);
    }

    if (hit) {
      return {
        blocked: rule.action === "block",
        flagged: true,
        rule: { id: rule.id, name: rule.name },
        message: "Your message was blocked by AutoMod (" + rule.name + ").",
      };
    }
  }

  return { blocked: false, flagged: false, rule: null, message: "" };
}