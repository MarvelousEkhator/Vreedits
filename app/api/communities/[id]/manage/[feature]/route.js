import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireCommunityAdmin, logAudit } from "@/lib/communityAdmin";

const FEATURES = ["audit", "automod", "emojis", "webhooks", "integrations", "analytics", "widget", "safety"];
const AUTOMOD_TYPES = ["keywords", "links", "caps", "spam", "mentions"];
const PROVIDERS = ["github", "youtube", "twitch", "twitter", "rss"];
const VERIFICATION_LEVELS = ["none", "low", "medium", "high"];
const MAX_IMAGE_CHARS = 300000;
const MAX_EMOJIS = 50;
const MAX_STICKERS = 20;

function bad(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function dayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function lastDays(n) {
  const out = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(now - i * 86400000));
  return out;
}

async function usernameMap(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, username: true },
  });
  return Object.fromEntries(users.map((u) => [u.id, u.username]));
}

function cleanAutoModConfig(type, cfg) {
  const c = cfg && typeof cfg === "object" ? cfg : {};
  const list = (v) =>
    Array.isArray(v) ? v.map((x) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 100) : [];
  const num = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  };
  if (type === "keywords") {
    const words = list(c.words);
    if (words.length === 0) return { error: "Add at least one word." };
    return { value: { words } };
  }
  if (type === "links") return { value: { allowedDomains: list(c.allowedDomains) } };
  if (type === "caps") return { value: { maxPercent: num(c.maxPercent, 30, 100, 70) } };
  if (type === "mentions") return { value: { max: num(c.max, 1, 50, 5) } };
  return { value: { maxRepeat: num(c.maxRepeat, 3, 50, 6) } };
}

// ───────────────────────── GET helpers ─────────────────────────

async function getAudit(community) {
  const [entries, actions] = await Promise.all([
    prisma.auditLogEntry.findMany({
      where: { communityId: community.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.moderationAction.findMany({
      where: { communityId: community.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const names = await usernameMap([
    ...entries.map((e) => e.actorId),
    ...actions.map((a) => a.moderatorId),
    ...actions.map((a) => a.targetUserId),
  ]);
  const merged = [
    ...entries.map((e) => ({
      id: e.id,
      source: "audit",
      action: e.action,
      summary: e.summary,
      actor: names[e.actorId] || "Unknown",
      createdAt: e.createdAt,
    })),
    ...actions.map((a) => ({
      id: a.id,
      source: "moderation",
      action: a.action,
      summary:
        "@" + (names[a.targetUserId] || "user") + (a.reason ? ": " + a.reason : ""),
      actor: names[a.moderatorId] || "Unknown",
      createdAt: a.createdAt,
    })),
  ]
    .sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))
    .slice(0, 150);
  return { entries: merged };
}

async function getSafety(community) {
  const communityId = community.id;
  const [reports, actions, joins, bans, restrictions] = await Promise.all([
    prisma.report.findMany({ where: { communityId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.moderationAction.findMany({ where: { communityId }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.joinEvent.findMany({
      where: { communityId, flagged: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.communityBan.findMany({ where: { communityId }, orderBy: { createdAt: "desc" } }),
    prisma.memberRestriction.findMany({
      where: { communityId, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "asc" },
    }),
  ]);

  const postIds = reports.filter((r) => r.targetType === "post").map((r) => r.targetId);
  const commentIds = reports.filter((r) => r.targetType === "comment").map((r) => r.targetId);
  const memberIds = reports.filter((r) => r.targetType === "member").map((r) => r.targetId);

  const [posts, comments] = await Promise.all([
    postIds.length
      ? prisma.post.findMany({ where: { id: { in: postIds } }, select: { id: true, content: true } })
      : [],
    commentIds.length
      ? prisma.comment.findMany({ where: { id: { in: commentIds } }, select: { id: true, content: true } })
      : [],
  ]);
  const postMap = Object.fromEntries(posts.map((p) => [p.id, p.content]));
  const commentMap = Object.fromEntries(comments.map((c) => [c.id, c.content]));

  const names = await usernameMap([
    ...reports.map((r) => r.reporterId),
    ...memberIds,
    ...actions.map((a) => a.moderatorId),
    ...actions.map((a) => a.targetUserId),
    ...joins.map((j) => j.userId),
  ]);

  return {
    settings: {
      verificationLevel: community.verificationLevel,
      raidProtectionOn: community.raidProtectionOn,
      maxMentionsPerMsg: community.maxMentionsPerMsg,
      joinLockdown: community.joinLockdown,
    },
    reports: reports.map((r) => {
      let preview = "";
      if (r.targetType === "member") preview = "@" + (names[r.targetId] || "user");
      if (r.targetType === "post") preview = postMap[r.targetId] || "(post deleted)";
      if (r.targetType === "comment") preview = commentMap[r.targetId] || "(reply deleted)";
      return {
        id: r.id,
        targetType: r.targetType,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt,
        reporter: names[r.reporterId] || "Unknown",
        preview: String(preview).slice(0, 200),
      };
    }),
    actions: actions.map((a) => ({
      id: a.id,
      action: a.action,
      reason: a.reason,
      moderator: names[a.moderatorId] || "Unknown",
      target: names[a.targetUserId] || "user",
      createdAt: a.createdAt,
    })),
    joins: joins.map((j) => ({
      id: j.id,
      username: names[j.userId] || "user",
      accountAgeDays: j.accountAgeDays,
      riskScore: j.riskScore,
      createdAt: j.createdAt,
    })),
    bans: bans.map((b) => ({
      id: b.id,
      userId: b.userId,
      username: b.username,
      reason: b.reason,
      createdAt: b.createdAt,
    })),
    restrictions: restrictions.map((r) => ({
      id: r.id,
      userId: r.userId,
      username: r.username,
      reason: r.reason,
      expiresAt: r.expiresAt,
    })),
  };
}

async function getAnalytics(community) {
  const communityId = community.id;
  const since = new Date(Date.now() - 30 * 86400000);
  const [posts, joins, channels, roleCount, openReports, invites, upcomingEvents] = await Promise.all([
    prisma.post.findMany({
      where: { communityId, createdAt: { gte: since } },
      select: { createdAt: true, authorId: true, channelId: true },
      take: 20000,
    }),
    prisma.joinEvent.findMany({
      where: { communityId, createdAt: { gte: since } },
      select: { createdAt: true },
      take: 20000,
    }),
    prisma.channel.findMany({ where: { communityId }, select: { id: true, name: true } }),
    prisma.role.count({ where: { communityId } }),
    prisma.report.count({ where: { communityId, status: "open" } }),
    prisma.invite.findMany({ where: { communityId }, select: { useCount: true } }),
    prisma.event.count({ where: { communityId, startTime: { gte: new Date() } } }),
  ]);

  const postDays = lastDays(14);
  const joinDays = lastDays(14);
  const postsByDay = Object.fromEntries(postDays.map((d) => [d, 0]));
  const joinsByDay = Object.fromEntries(joinDays.map((d) => [d, 0]));
  const byChannel = {};
  const byAuthor = {};
  for (const p of posts) {
    const k = dayKey(p.createdAt);
    if (k in postsByDay) postsByDay[k] += 1;
    if (p.channelId) byChannel[p.channelId] = (byChannel[p.channelId] || 0) + 1;
    byAuthor[p.authorId] = (byAuthor[p.authorId] || 0) + 1;
  }
  for (const j of joins) {
    const k = dayKey(j.createdAt);
    if (k in joinsByDay) joinsByDay[k] += 1;
  }

  const channelName = Object.fromEntries(channels.map((c) => [c.id, c.name]));
  const topChannels = Object.entries(byChannel)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ name: channelName[id] || "deleted-channel", count }));

  const topAuthorPairs = Object.entries(byAuthor).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const names = await usernameMap(topAuthorPairs.map(([id]) => id));
  const topPosters = topAuthorPairs.map(([id, count]) => ({ username: names[id] || "user", count }));

  return {
    totals: {
      members: (community.memberIds || []).length,
      channels: channels.length,
      roles: roleCount,
      posts30d: posts.length,
      joins30d: joins.length,
      openReports,
      inviteUses: invites.reduce((sum, i) => sum + (i.useCount || 0), 0),
      upcomingEvents,
    },
    postsByDay: postDays.map((d) => ({ label: d, value: postsByDay[d] })),
    joinsByDay: joinDays.map((d) => ({ label: d, value: joinsByDay[d] })),
    topChannels,
    topPosters,
  };
}

export async function GET(request, { params }) {
  const { id, feature } = params;
  if (!FEATURES.includes(feature)) return bad("Unknown feature.", 404);
  const auth = await requireCommunityAdmin(id);
  if (auth.error) return auth.error;
  const { community } = auth;

  try {
    if (feature === "audit") return NextResponse.json(await getAudit(community));
    if (feature === "safety") return NextResponse.json(await getSafety(community));
    if (feature === "analytics") return NextResponse.json(await getAnalytics(community));

    if (feature === "automod") {
      const rules = await prisma.autoModRule.findMany({
        where: { communityId: id },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json({ rules });
    }

    if (feature === "emojis") {
      const items = await prisma.communityEmoji.findMany({
        where: { communityId: id },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json({ items, limits: { emoji: MAX_EMOJIS, sticker: MAX_STICKERS } });
    }

    if (feature === "webhooks") {
      const webhooks = await prisma.communityWebhook.findMany({
        where: { communityId: id },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json({ webhooks });
    }

    if (feature === "integrations") {
      const integrations = await prisma.communityIntegration.findMany({
        where: { communityId: id },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json({ integrations });
    }

    if (feature === "widget") {
      const [widget, invites] = await Promise.all([
        prisma.communityWidget.findUnique({ where: { communityId: id } }),
        prisma.invite.findMany({
          where: { communityId: id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { code: true },
        }),
      ]);
      return NextResponse.json({
        widget: widget || { enabled: false, theme: "dark", showMembers: true, inviteCode: null },
        invites: invites.map((i) => i.code),
      });
    }

    return bad("Unknown feature.", 404);
  } catch (err) {
    console.error("GET manage/" + feature + " error:", err);
    return bad("Database error, please retry.", 500);
  }
}

// ───────────────────────── POST (create) ─────────────────────────

export async function POST(request, { params }) {
  const { id, feature } = params;
  if (!FEATURES.includes(feature)) return bad("Unknown feature.", 404);
  const auth = await requireCommunityAdmin(id);
  if (auth.error) return auth.error;
  const { userId } = auth;
  const body = await request.json().catch(() => ({}));

  try {
    if (feature === "automod") {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
      if (!name) return bad("Give the rule a name.");
      if (!AUTOMOD_TYPES.includes(body.type)) return bad("Invalid rule type.");
      const count = await prisma.autoModRule.count({ where: { communityId: id } });
      if (count >= 25) return bad("You can have up to 25 AutoMod rules.");
      const config = cleanAutoModConfig(body.type, body.config);
      if (config.error) return bad(config.error);
      const rule = await prisma.autoModRule.create({
        data: {
          communityId: id,
          name,
          type: body.type,
          config: config.value,
          action: body.action === "flag" ? "flag" : "block",
        },
      });
      await logAudit({
        communityId: id, actorId: userId, action: "automod.create",
        targetType: "automod", targetId: rule.id, summary: 'Created AutoMod rule "' + name + '"',
      });
      return NextResponse.json({ rule }, { status: 201 });
    }

    if (feature === "emojis") {
      const kind = body.kind === "sticker" ? "sticker" : "emoji";
      const name = String(body.name || "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32);
      if (name.length < 2) return bad("Name must be at least 2 characters.");
      const img = body.imageDataUrl;
      if (typeof img !== "string" || !img.startsWith("data:image/")) return bad("Upload an image.");
      if (img.length > MAX_IMAGE_CHARS) return bad("That image is too large.");
      const count = await prisma.communityEmoji.count({ where: { communityId: id, kind } });
      if (count >= (kind === "emoji" ? MAX_EMOJIS : MAX_STICKERS)) {
        return bad("You've reached the limit for " + kind + "s.");
      }
      const exists = await prisma.communityEmoji.findFirst({ where: { communityId: id, kind, name } });
      if (exists) return bad("That name is already used.");
      const item = await prisma.communityEmoji.create({
        data: { communityId: id, kind, name, imageDataUrl: img, createdById: userId },
      });
      await logAudit({
        communityId: id, actorId: userId, action: kind + ".create",
        targetType: kind, targetId: item.id, summary: "Added " + kind + " :" + name + ":",
      });
      return NextResponse.json({ item }, { status: 201 });
    }

    if (feature === "webhooks") {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
      if (!name) return bad("Give the webhook a name.");
      const channel = await prisma.channel.findFirst({
        where: { id: String(body.channelId || ""), communityId: id },
      });
      if (!channel) return bad("Pick a channel.");
      const count = await prisma.communityWebhook.count({ where: { communityId: id } });
      if (count >= 15) return bad("You can have up to 15 webhooks.");
      const webhook = await prisma.communityWebhook.create({
        data: {
          communityId: id,
          channelId: channel.id,
          name,
          token: crypto.randomBytes(24).toString("hex"),
          createdById: userId,
        },
      });
      await logAudit({
        communityId: id, actorId: userId, action: "webhook.create",
        targetType: "webhook", targetId: webhook.id,
        summary: 'Created webhook "' + name + '" for #' + channel.name,
      });
      return NextResponse.json({ webhook }, { status: 201 });
    }

    if (feature === "integrations") {
      if (!PROVIDERS.includes(body.provider)) return bad("Pick a provider.");
      const label = typeof body.label === "string" ? body.label.trim().slice(0, 60) : "";
      if (!label) return bad("Give the integration a label.");
      const url = typeof body.url === "string" ? body.url.trim() : "";
      if (!/^https?:\/\/\S+$/i.test(url)) return bad("Enter a valid http(s) link.");
      let channelId = null;
      if (body.channelId) {
        const channel = await prisma.channel.findFirst({
          where: { id: String(body.channelId), communityId: id },
        });
        if (!channel) return bad("That channel doesn't exist.");
        channelId = channel.id;
      }
      const count = await prisma.communityIntegration.count({ where: { communityId: id } });
      if (count >= 20) return bad("You can have up to 20 integrations.");
      const integration = await prisma.communityIntegration.create({
        data: {
          communityId: id,
          provider: body.provider,
          label,
          url: url.slice(0, 500),
          channelId,
          createdById: userId,
        },
      });
      await logAudit({
        communityId: id, actorId: userId, action: "integration.create",
        targetType: "integration", targetId: integration.id,
        summary: "Connected " + body.provider + ' "' + label + '"',
      });
      return NextResponse.json({ integration }, { status: 201 });
    }

    return bad("This feature doesn't support creating items.", 405);
  } catch (err) {
    console.error("POST manage/" + feature + " error:", err);
    return bad("Database error, please retry.", 500);
  }
}

// ───────────────────────── PATCH (update) ─────────────────────────

export async function PATCH(request, { params }) {
  const { id, feature } = params;
  if (!FEATURES.includes(feature)) return bad("Unknown feature.", 404);
  const auth = await requireCommunityAdmin(id);
  if (auth.error) return auth.error;
  const { userId, community } = auth;
  const body = await request.json().catch(() => ({}));

  try {
    if (feature === "safety") {
      if (body.settings && typeof body.settings === "object") {
        const s = body.settings;
        const data = {};
        if (VERIFICATION_LEVELS.includes(s.verificationLevel)) data.verificationLevel = s.verificationLevel;
        if (typeof s.raidProtectionOn === "boolean") data.raidProtectionOn = s.raidProtectionOn;
        if (typeof s.joinLockdown === "boolean") data.joinLockdown = s.joinLockdown;
        const max = parseInt(s.maxMentionsPerMsg, 10);
        if (Number.isFinite(max) && max >= 1 && max <= 50) data.maxMentionsPerMsg = max;
        await prisma.community.update({ where: { id }, data });
        await logAudit({
          communityId: id, actorId: userId, action: "safety.update",
          summary: "Updated safety settings",
        });
        return NextResponse.json({ ok: true });
      }

      if (body.reportId) {
        const report = await prisma.report.findFirst({ where: { id: String(body.reportId), communityId: id } });
        if (!report) return bad("Report not found.", 404);
        if (body.removeContent) {
          if (report.targetType === "post") {
            await prisma.post.deleteMany({ where: { id: report.targetId, communityId: id } });
          } else if (report.targetType === "comment") {
            await prisma.comment.deleteMany({ where: { id: report.targetId } });
          }
        }
        const status = body.removeContent || body.status === "resolved"
          ? "resolved"
          : body.status === "dismissed" ? "dismissed" : null;
        if (!status) return bad("Invalid status.");
        await prisma.report.update({ where: { id: report.id }, data: { status } });
        await logAudit({
          communityId: id, actorId: userId, action: "report." + status,
          targetType: "report", targetId: report.id,
          summary: (body.removeContent ? "Removed reported " + report.targetType + " and resolved" : "Marked " + status) + " a report",
        });
        return NextResponse.json({ ok: true });
      }

      // ── Ban a member ──
      if (body.banUserId) {
        const targetUserId = String(body.banUserId);
        if (targetUserId === community.ownerId) return bad("You can't ban the community owner.");
        const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
        if (!targetUser) return bad("User not found.", 404);
        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) || null : null;

        await prisma.communityBan.upsert({
          where: { communityId_userId: { communityId: id, userId: targetUserId } },
          update: { reason, bannedById: userId },
          create: { communityId: id, userId: targetUserId, username: targetUser.username, reason, bannedById: userId },
        });

        await prisma.community.update({
          where: { id },
          data: {
            memberIds: community.memberIds.filter((m) => m !== targetUserId),
            adminIds: community.adminIds.filter((m) => m !== targetUserId),
          },
        });

        await prisma.moderationAction.create({
          data: { communityId: id, moderatorId: userId, targetUserId, action: "ban", reason },
        });
        await logAudit({
          communityId: id, actorId: userId, action: "member.ban",
          targetType: "user", targetId: targetUserId,
          summary: "Banned @" + targetUser.username + (reason ? ": " + reason : ""),
        });
        return NextResponse.json({ ok: true });
      }

      // ── Unban a member ──
      if (body.unbanId) {
        const ban = await prisma.communityBan.findFirst({ where: { id: String(body.unbanId), communityId: id } });
        if (!ban) return bad("Ban not found.", 404);
        await prisma.communityBan.delete({ where: { id: ban.id } });
        await prisma.moderationAction.create({
          data: { communityId: id, moderatorId: userId, targetUserId: ban.userId, action: "unban" },
        });
        await logAudit({
          communityId: id, actorId: userId, action: "member.unban",
          targetType: "user", targetId: ban.userId, summary: "Unbanned @" + ban.username,
        });
        return NextResponse.json({ ok: true });
      }

      // ── Timeout (temporarily restrict) a member ──
      if (body.timeoutUserId) {
        const targetUserId = String(body.timeoutUserId);
        if (targetUserId === community.ownerId) return bad("You can't restrict the community owner.");
        if (!community.memberIds.includes(targetUserId)) return bad("That user isn't a member.");
        const minutes = parseInt(body.minutes, 10);
        if (!Number.isFinite(minutes) || minutes < 1 || minutes > 43200) {
          return bad("Pick a duration between 1 minute and 30 days.");
        }
        const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
        if (!targetUser) return bad("User not found.", 404);
        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) || null : null;
        const expiresAt = new Date(Date.now() + minutes * 60000);

        await prisma.memberRestriction.upsert({
          where: { communityId_userId: { communityId: id, userId: targetUserId } },
          update: { reason, expiresAt, restrictedById: userId },
          create: {
            communityId: id, userId: targetUserId, username: targetUser.username,
            reason, expiresAt, restrictedById: userId,
          },
        });

        await prisma.moderationAction.create({
          data: { communityId: id, moderatorId: userId, targetUserId, action: "timeout", reason },
        });
        await logAudit({
          communityId: id, actorId: userId, action: "member.timeout",
          targetType: "user", targetId: targetUserId,
          summary: "Timed out @" + targetUser.username + " for " + minutes + "m" + (reason ? ": " + reason : ""),
        });
        return NextResponse.json({ ok: true });
      }

      // ── Lift a restriction early ──
      if (body.liftRestrictionId) {
        const restriction = await prisma.memberRestriction.findFirst({
          where: { id: String(body.liftRestrictionId), communityId: id },
        });
        if (!restriction) return bad("Restriction not found.", 404);
        await prisma.memberRestriction.delete({ where: { id: restriction.id } });
        await prisma.moderationAction.create({
          data: { communityId: id, moderatorId: userId, targetUserId: restriction.userId, action: "timeout_removed" },
        });
        await logAudit({
          communityId: id, actorId: userId, action: "member.timeout_removed",
          targetType: "user", targetId: restriction.userId, summary: "Removed timeout for @" + restriction.username,
        });
        return NextResponse.json({ ok: true });
      }

      return bad("Nothing to update.");
    }

    if (feature === "automod") {
      const rule = await prisma.autoModRule.findFirst({ where: { id: String(body.ruleId || ""), communityId: id } });
      if (!rule) return bad("Rule not found.", 404);
      const data = {};
      if (typeof body.enabled === "boolean") data.enabled = body.enabled;
      if (body.action === "block" || body.action === "flag") data.action = body.action;
      if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 60);
      const updated = await prisma.autoModRule.update({ where: { id: rule.id }, data });
      await logAudit({
        communityId: id, actorId: userId, action: "automod.update",
        targetType: "automod", targetId: rule.id,
        summary: (typeof body.enabled === "boolean" ? (body.enabled ? "Enabled" : "Disabled") : "Updated") + ' AutoMod rule "' + rule.name + '"',
      });
      return NextResponse.json({ rule: updated });
    }

    if (feature === "webhooks") {
      const webhook = await prisma.communityWebhook.findFirst({
        where: { id: String(body.webhookId || ""), communityId: id },
      });
      if (!webhook) return bad("Webhook not found.", 404);
      const data = {};
      if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 60);
      if (body.channelId) {
        const channel = await prisma.channel.findFirst({ where: { id: String(body.channelId), communityId: id } });
        if (!channel) return bad("That channel doesn't exist.");
        data.channelId = channel.id;
      }
      if (body.regenerate) data.token = crypto.randomBytes(24).toString("hex");
      const updated = await prisma.communityWebhook.update({ where: { id: webhook.id }, data });
      await logAudit({
        communityId: id, actorId: userId, action: body.regenerate ? "webhook.regenerate" : "webhook.update",
        targetType: "webhook", targetId: webhook.id,
        summary: (body.regenerate ? "Regenerated the URL for" : "Updated") + ' webhook "' + webhook.name + '"',
      });
      return NextResponse.json({ webhook: updated });
    }

    if (feature === "integrations") {
      const integration = await prisma.communityIntegration.findFirst({
        where: { id: String(body.integrationId || ""), communityId: id },
      });
      if (!integration) return bad("Integration not found.", 404);
      const data = {};
      if (typeof body.enabled === "boolean") data.enabled = body.enabled;
      if (typeof body.label === "string" && body.label.trim()) data.label = body.label.trim().slice(0, 60);
      const updated = await prisma.communityIntegration.update({ where: { id: integration.id }, data });
      await logAudit({
        communityId: id, actorId: userId, action: "integration.update",
        targetType: "integration", targetId: integration.id,
        summary: (typeof body.enabled === "boolean" ? (body.enabled ? "Enabled" : "Paused") : "Updated") + ' integration "' + integration.label + '"',
      });
      return NextResponse.json({ integration: updated });
    }

    if (feature === "emojis") {
      const item = await prisma.communityEmoji.findFirst({ where: { id: String(body.itemId || ""), communityId: id } });
      if (!item) return bad("Not found.", 404);
      const name = String(body.name || "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32);
      if (name.length < 2) return bad("Name must be at least 2 characters.");
      const clash = await prisma.communityEmoji.findFirst({
        where: { communityId: id, kind: item.kind, name, NOT: { id: item.id } },
      });
      if (clash) return bad("That name is already used.");
      const updated = await prisma.communityEmoji.update({ where: { id: item.id }, data: { name } });
      return NextResponse.json({ item: updated });
    }

    if (feature === "widget") {
      const data = {};
      if (typeof body.enabled === "boolean") data.enabled = body.enabled;
      if (body.theme === "dark" || body.theme === "light") data.theme = body.theme;
      if (typeof body.showMembers === "boolean") data.showMembers = body.showMembers;
      if (body.inviteCode === null || body.inviteCode === "") {
        data.inviteCode = null;
      } else if (typeof body.inviteCode === "string") {
        const invite = await prisma.invite.findFirst({ where: { code: body.inviteCode, communityId: id } });
        if (!invite) return bad("That invite doesn't exist.");
        data.inviteCode = invite.code;
      }
      const widget = await prisma.communityWidget.upsert({
        where: { communityId: id },
        create: { communityId: id, ...data },
        update: data,
      });
      await logAudit({
        communityId: id, actorId: userId, action: "widget.update",
        summary: "Updated the community widget",
      });
      return NextResponse.json({ widget });
    }

    return bad("This feature doesn't support updates.", 405);
  } catch (err) {
    console.error("PATCH manage/" + feature + " error:", err);
    return bad("Database error, please retry.", 500);
  }
}

// ───────────────────────── DELETE ─────────────────────────

export async function DELETE(request, { params }) {
  const { id, feature } = params;
  if (!FEATURES.includes(feature)) return bad("Unknown feature.", 404);
  const auth = await requireCommunityAdmin(id);
  if (auth.error) return auth.error;
  const { userId } = auth;
  const itemId = new URL(request.url).searchParams.get("id");
  if (!itemId) return bad("Missing id.");

  try {
    if (feature === "automod") {
      const rule = await prisma.autoModRule.findFirst({ where: { id: itemId, communityId: id } });
      if (!rule) return bad("Rule not found.", 404);
      await prisma.autoModRule.delete({ where: { id: rule.id } });
      await logAudit({
        communityId: id, actorId: userId, action: "automod.delete",
        targetType: "automod", targetId: rule.id, summary: 'Deleted AutoMod rule "' + rule.name + '"',
      });
      return NextResponse.json({ ok: true });
    }

    if (feature === "emojis") {
      const item = await prisma.communityEmoji.findFirst({ where: { id: itemId, communityId: id } });
      if (!item) return bad("Not found.", 404);
      await prisma.communityEmoji.delete({ where: { id: item.id } });
      await logAudit({
        communityId: id, actorId: userId, action: item.kind + ".delete",
        targetType: item.kind, targetId: item.id, summary: "Removed " + item.kind + " :" + item.name + ":",
      });
      return NextResponse.json({ ok: true });
    }

    if (feature === "webhooks") {
      const webhook = await prisma.communityWebhook.findFirst({ where: { id: itemId, communityId: id } });
      if (!webhook) return bad("Webhook not found.", 404);
      await prisma.communityWebhook.delete({ where: { id: webhook.id } });
      await logAudit({
        communityId: id, actorId: userId, action: "webhook.delete",
        targetType: "webhook", targetId: webhook.id, summary: 'Deleted webhook "' + webhook.name + '"',
      });
      return NextResponse.json({ ok: true });
    }

    if (feature === "integrations") {
      const integration = await prisma.communityIntegration.findFirst({ where: { id: itemId, communityId: id } });
      if (!integration) return bad("Integration not found.", 404);
      await prisma.communityIntegration.delete({ where: { id: integration.id } });
      await logAudit({
        communityId: id, actorId: userId, action: "integration.delete",
        targetType: "integration", targetId: integration.id,
        summary: 'Removed integration "' + integration.label + '"',
      });
      return NextResponse.json({ ok: true });
    }

    return bad("This feature doesn't support deleting.", 405);
  } catch (err) {
    console.error("DELETE manage/" + feature + " error:", err);
    return bad("Database error, please retry.", 500);
  }
}
