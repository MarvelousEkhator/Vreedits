// Wins in the other games are reported by the browser, so they're limited, not proven:
// fixed payouts, one claim per win, a short gap, a daily limit per game and the overall daily cap.
async function handleGame(user, body) {
  const { gameId, level, claimId } = body;
  const won = body.outcome !== "played"; // "win" (default) or "played" (finished, didn't win)
  const base = typeof gameId === "string" && Object.prototype.hasOwnProperty.call(GAME_NEURONS, gameId) ? GAME_NEURONS[gameId] : 0;
  if (!base) return bad("Unknown game.");
  if (typeof claimId !== "string" || claimId.length < 6 || claimId.length > 40) return bad("That win doesn't look right.");
  const mult = won ? LEVEL_MULT[level] || 1 : 1;

  const key = `game:${user.id}:${gameId}:${claimId}`;
  const already = await prisma.walletTransaction.findUnique({ where: { idempotencyKey: key } });
  if (already) return reply(user.id, { duplicate: true });

  const last = await prisma.walletTransaction.findFirst({
    where: { userId: user.id, refType: { startsWith: "mindgym-game" } },
    orderBy: { createdAt: "desc" },
  });
  if (last && Date.now() - new Date(last.createdAt).getTime() < GAME_MIN_GAP_MS) {
    return reply(user.id, null, { message: "Slow down a little. Neurons are paid for real wins, one at a time." });
  }
  const startOfDay = new Date(utcDay() + "T00:00:00.000Z");
  const today = await prisma.walletTransaction.count({
    where: { userId: user.id, refType: `mindgym-game-${gameId}`, createdAt: { gte: startOfDay } },
  });
  if (today >= GAME_MAX_WINS_PER_DAY) {
    return reply(user.id, null, { message: `You've earned the daily limit for this game (${GAME_MAX_WINS_PER_DAY} paid rounds). Try another game or come back tomorrow.` });
  }
  const amount = won ? Math.round(base * mult) : Math.max(1, Math.round(base * PLAY_SHARE));
  const res = await awardNeurons(user.id, amount, {
    reason: won ? `${gameId} win${LEVEL_MULT[level] ? " (" + level + ")" : ""}` : `${gameId} round played`,
    refType: `mindgym-game-${gameId}`,
    refId: claimId,
    idempotencyKey: key,
  });
  return reply(user.id, res);
}

// Played days (for the Home streak) are saved to the account, so the streak is the same on every browser.
async function handleDays(user, body) {
  const lo = utcDay(-120), hi = utcDay(1);
  const incoming = Array.isArray(body.days) ? body.days.slice(0, 120) : [];
  const valid = Array.from(new Set(incoming.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= lo && d <= hi)));
  if (valid.length) {
    await prisma.mindGymDay.createMany({ data: valid.map((day) => ({ userId: user.id, day })), skipDuplicates: true });
  }
  const rows = await prisma.mindGymDay.findMany({ where: { userId: user.id, day: { gte: lo } }, select: { day: true }, orderBy: { day: "asc" } });
  return NextResponse.json({ ok: true, days: rows.map((x) => x.day) });
}

export async function POST(req) {
  const user = await requireUser();
  if (!user) return bad("Not signed in", 401);
  if (user.isGuest) return guestBlockedResponse();

  let body;
  try { body = await req.json(); } catch { return bad("Bad request."); }
  if (!body || typeof body !== "object") return bad("Bad request.");

  try {
    if (body.game === "math") return await handleMath(user, body);
    if (body.game === "sudoku") return await handleSudoku(user, body);
    if (body.game === "play") return await handleGame(user, body);
    if (body.game === "days") return await handleDays(user, body);
    return bad("Unknown game.");
  } catch (err) {
    console.error("mindgym reward failed", err);
    return bad("Couldn't add Neurons right now. Your score is still saved on this device.", 500);
  }
}