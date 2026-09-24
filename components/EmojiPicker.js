"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { Plus } from "lucide-react";

const RECENT_KEY = "vreedits:recent-emojis";
const MAX_RECENT = 36;
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

const words = (s) => Array.from(new Set(s.trim().split(/\s+/)));

// ───────── Flags (built from country codes) ─────────
const COUNTRY_CODES =
  "AC AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CP CR CU CV CW CX CY CZ DE DG DJ DK DM DO DZ EA EC EE EG EH ER ES ET EU " +
  "FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU IC ID IE IL IM IN IO IQ IR IS IT " +
  "JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TA TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
  "UA UG UM UN US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW";

const FLAG_EMOJIS = COUNTRY_CODES.split(" ").map((code) =>
  String.fromCodePoint(...[...code].map((ch) => 127397 + ch.charCodeAt(0)))
);

// ───────── Emoji sets ─────────
const CATEGORIES = [
  {
    id: "smileys", icon: "😀", label: "Smileys & Emotion",
    emojis: words(`
      😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 ☺️ 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔
      🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐
      😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️
      💩 🤡 👹 👺 👻 👽 👾 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾 🙈 🙉 🙊 💋 💌 💘 💝 💖 💗 💓 💞 💕 💟 ❣️ 💔
      ❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💯 💢 💥 💫 💦 💨 🕳️ 💬 🗨️ 🗯️ 💭 💤
    `),
  },
  {
    id: "people", icon: "👋", label: "People & Body",
    emojis: words(`
      👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏
      ✍️ 💅 🤳 💪 🦾 🦿 🦵 🦶 👂 🦻 👃 🧠 🫀 🫁 🦷 🦴 👀 👁️ 👅 👄
      👶 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 👮 🕵️ 💂 🥷 👷 🤴 👸 👳 👲 🧕
      🤵 👰 🤰 🤱 👼 🎅 🤶 🦸 🦹 🧙 🧚 🧛 🧜 🧝 🧞 🧟 💆 💇 🚶 🧍 🧎 🏃 💃 🕺 🕴️ 👯 🧖 🧗 🤺 🏇 ⛷️ 🏂
      🏌️ 🏄 🚣 🏊 ⛹️ 🏋️ 🚴 🚵 🤸 🤼 🤽 🤾 🤹 🧘 🛀 🛌 👭 👫 👬 💏 💑 👪 🗣️ 👤 👥 🫂 👣
      🧳 🌂 ☂️ 🧵 🧶 👓 🕶️ 🥽 🥼 🦺 👔 👕 👖 🧣 🧤 🧥 🧦 👗 👘 🥻 🩱 🩲 🩳 👙 👚 👛 👜 👝 🎒
      👞 👟 🥾 🥿 👠 👡 🩰 👢 👑 👒 🎩 🎓 🧢 ⛑️ 💄 💍 💼
    `),
  },
  {
    id: "animals", icon: "🐶", label: "Animals & Nature",
    emojis: words(`
      🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🐒 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝
      🐛 🦋 🐌 🐞 🐜 🦟 🦗 🕷️ 🕸️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓
      🦍 🦧 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🦮 🐈 🐓 🦃 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝
      🦨 🦡 🦦 🦥 🐁 🐀 🐿️ 🦔 🐾 🐉 🐲 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🎍 🎋 🍃 🍂 🍁 🍄 🐚 🌾 💐 🌷 🌹
      🥀 🌺 🌸 🌼 🌻 🌞 🌝 🌛 🌜 🌚 🌕 🌖 🌗 🌘 🌑 🌒 🌓 🌔 🌙 🌎 🌍 🌏 🪐 ⭐ 🌟 ✨ ⚡ ☄️ 🔥 🌪️ 🌈
      ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💧 ☔ 🌊
    `),
  },
  {
    id: "food", icon: "🍔", label: "Food & Drink",
    emojis: words(`
      🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🧄 🧅 🥔 🍠
      🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🥙 🧆 🌮 🌯 🥗 🥘 🥫 🍝 🍜 🍲
      🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯
      🥛 🍼 ☕ 🍵 🧃 🥤 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🧊 🥄 🍴 🍽️ 🥣 🥡 🥢 🧂
    `),
  },
  {
    id: "activities", icon: "⚽", label: "Activities",
    emojis: words(`
      ⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌
      🎿 🏆 🥇 🥈 🥉 🏅 🎖️ 🏵️ 🎗️ 🎫 🎟️ 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩
    `),
  },
  {
    id: "travel", icon: "🚗", label: "Travel & Places",
    emojis: words(`
      🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🚚 🚛 🚜 🦯 🦽 🦼 🛴 🚲 🛵 🏍️ 🛺 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞
      🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🛰️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ ⛽ 🚧 🚦 🚥 🚏
      🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🏠 🏡 🏘️ 🏚️ 🏗️ 🏭 🏢 🏬
      🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🕍 🛕 🕋 ⛩️ 🛤️ 🛣️ 🗾 🎑 🏞️ 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙️ 🌃 🌌 🌉 🌁
    `),
  },
  {
    id: "objects", icon: "💡", label: "Objects",
    emojis: words(`
      ⌚ 📱 📲 💻 ⌨️ 🖥️ 🖨️ 🖱️ 🖲️ 🕹️ 💽 💾 💿 📀 📼 📷 📸 📹 🎥 📽️ 🎞️ 📞 ☎️ 📟 📠 📺 📻 🎙️ 🎚️ 🎛️ 🧭
      ⏱️ ⏲️ ⏰ 🕰️ ⌛ ⏳ 📡 🔋 🔌 💡 🔦 🕯️ 🪔 🧯 🛢️ 💸 💵 💴 💶 💷 💰 💳 💎 ⚖️ 🧰 🔧 🔨 ⚒️ 🛠️ ⛏️
      🔩 ⚙️ 🧱 ⛓️ 🧲 🔫 💣 🧨 🪓 🔪 🗡️ ⚔️ 🛡️ 🚬 ⚰️ ⚱️ 🏺 🔮 📿 🧿 💈 ⚗️ 🔭 🔬 🩹 🩺 💊 💉 🩸 🧬 🦠
      🧫 🧪 🌡️ 🧹 🧺 🧻 🚽 🚰 🚿 🛁 🧼 🪒 🧽 🧴 🛎️ 🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🧸 🖼️ 🛍️ 🛒 🎁 🎈 🎏 🎀 🎊 🎉 🎎
      🏮 🎐 🧧 ✉️ 📩 📨 📧 📥 📤 📦 🏷️ 📪 📫 📬 📭 📮 📯 📜 📃 📄 📑 🧾 📊 📈 📉 🗒️ 🗓️ 📆 📅 🗑️ 📇 🗃️
      🗳️ 🗄️ 📋 📁 📂 🗂️ 🗞️ 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🧷 🔗 📎 🖇️ 📐 📏 🧮 📌 📍 ✂️ 🖊️ 🖋️ ✒️
      🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓
    `),
  },
  {
    id: "symbols", icon: "❤️", label: "Symbols",
    emojis: words(`
      ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎
      ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ 🉑 ☢️ ☣️ 📴 📳 🈶 🈚 🈸 🈺 🈷️ ✴️ 🆚 💮 🉐 ㊙️ ㊗️ 🈴 🈵 🈹
      🈲 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕ 🛑 ⛔ 📛 🚫 💯 💢 ♨️ 🚷 🚯 🚳 🚱 🔞 📵 🚭 ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆
      〽️ ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✅ 🈯 💹 ❇️ ✳️ ❎ 🌐 💠 Ⓜ️ 🌀 💤 🏧 🚾 ♿ 🅿️ 🈳 🈂️ 🛂 🛃 🛄 🛅 🚹 🚺 🚼 🚻
      🚮 🎦 📶 🈁 🔣 ℹ️ 🔤 🔡 🔠 🆖 🆗 🆙 🆒 🆕 🆓 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 🔢 #️⃣ *️⃣
      ⏏️ ▶️ ⏸️ ⏯️ ⏹️ ⏺️ ⏭️ ⏮️ ⏩ ⏪ ⏫ ⏬ ◀️ 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ ↪️ ↩️ ⤴️ ⤵️
      🔀 🔁 🔂 🔄 🔃 🎵 🎶 ➕ ➖ ➗ ✖️ ♾️ 💲 💱 ™️ ©️ ®️ 〰️ ➰ ➿ 🔚 🔙 🔛 🔝 🔜 ✔️ ☑️ 🔘
      🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔺 🔻 🔸 🔹 🔶 🔷 🔳 🔲 ▪️ ▫️ ◾ ◽ ◼️ ◻️ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🟫
      🔈 🔇 🔉 🔊 🔔 🔕 📣 📢 ♠️ ♣️ ♥️ ♦️ 🃏 🎴 🀄
      🕐 🕑 🕒 🕓 🕔 🕕 🕖 🕗 🕘 🕙 🕚 🕛 🕜 🕝 🕞 🕟 🕠 🕡 🕢 🕣 🕤 🕥 🕦 🕧
    `),
  },
  {
    id: "flags", icon: "🏁", label: "Flags",
    emojis: [...words("🏁 🚩 🎌 🏴 🏳️ 🏳️‍🌈 🏴‍☠️"), ...FLAG_EMOJIS],
  },
];

// ───────── Recently used (saved on this device) ─────────
function readRecents() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeRecents(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {}
}

// ───────── Helpers other files can use ─────────

// Puts text into an input at the caret position. Returns the new value and caret.
export function insertAtCursor(inputEl, currentValue, insert) {
  const start = inputEl?.selectionStart ?? currentValue.length;
  const end = inputEl?.selectionEnd ?? currentValue.length;
  return {
    value: currentValue.slice(0, start) + insert + currentValue.slice(end),
    caret: start + insert.length,
  };
}

const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200D\uFE0F\u20E3\s]+$/u;

// Turns message text into content: :name: becomes the custom emoji image,
// emoji-only messages are shown big, and a lone sticker is shown large.
export function renderMessageContent(text, customEmojis = []) {
  if (!text) return text;
  const map = new Map(customEmojis.map((e) => [e.name, e]));
  const trimmed = text.trim();

  const single = trimmed.match(/^:([a-z0-9_]+):$/);
  const singleEmoji = single ? map.get(single[1]) : null;
  if (singleEmoji && singleEmoji.type === "sticker") {
    return (
      <img
        src={singleEmoji.imageDataUrl}
        alt={`:${singleEmoji.name}:`}
        title={`:${singleEmoji.name}:`}
        style={{ width: 128, height: 128, objectFit: "contain", display: "block", marginTop: 4, borderRadius: 8 }}
      />
    );
  }

  const leftover = trimmed.replace(/:([a-z0-9_]+):/g, (m, n) => (map.has(n) ? "" : m));
  const shortcodeCount = (trimmed.match(/:([a-z0-9_]+):/g) || []).filter((m) => map.has(m.slice(1, -1))).length;
  const leftoverCount = Array.from(leftover.replace(/\s/g, "")).length;
  const total = shortcodeCount + leftoverCount;
  const jumbo = total > 0 && total <= 27 && (leftover === "" || EMOJI_ONLY_RE.test(leftover));

  const size = jumbo ? 40 : 22;
  const nodes = text.split(/(:[a-z0-9_]+:)/g).map((part, i) => {
    const m = part.match(/^:([a-z0-9_]+):$/);
    const e = m ? map.get(m[1]) : null;
    if (!e) return part;
    const px = e.type === "sticker" ? 64 : size;
    return (
      <img
        key={i}
        src={e.imageDataUrl}
        alt={part}
        title={part}
        style={{
          width: px, height: px, objectFit: "cover", borderRadius: 4,
          verticalAlign: "middle", display: "inline-block", margin: "0 1px",
        }}
      />
    );
  });

  return jumbo ? <span style={{ fontSize: 34, lineHeight: 1.3 }}>{nodes}</span> : <>{nodes}</>;
}

// ───────── The picker ─────────
export default function EmojiPicker({
  customEmojis = [],
  canUpload = false,
  onUpload,
  onPickUnicode,
  onPickCustom,
  height = 300,
}) {
  const [tab, setTab] = useState("smileys");
  const [recents, setRecents] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    const r = readRecents();
    setRecents(r);
    if (r.length > 0) setTab("recent");
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const byName = useMemo(() => new Map(customEmojis.map((e) => [e.name, e])), [customEmojis]);
  const emojiList = customEmojis.filter((e) => e.type !== "sticker");
  const stickerList = customEmojis.filter((e) => e.type === "sticker");
  const showCustomTabs = customEmojis.length > 0 || (canUpload && !!onUpload);

  const tabs = [
    { id: "recent", icon: "🕒", label: "Recently used" },
    ...(showCustomTabs
      ? [
          { id: "custom", icon: "⭐", label: "Custom emojis" },
          { id: "stickers", icon: "🎟️", label: "Stickers" },
        ]
      : []),
    ...CATEGORIES,
  ];
  const activeTab = tabs.find((t) => t.id === tab) || tabs[0];

  function remember(token) {
    setRecents((prev) => {
      const next = [token, ...prev.filter((t) => t !== token)].slice(0, MAX_RECENT);
      writeRecents(next);
      return next;
    });
  }

  function pickUnicode(ch) {
    remember(ch);
    onPickUnicode?.(ch);
  }

  function pickCustom(e) {
    remember(`:${e.name}:`);
    onPickCustom?.(e);
  }

  const cellBase = {
    height: 44, display: "flex", alignItems: "center", justifyContent: "center",
    background: "none", border: "none", borderRadius: 10, padding: 0,
  };

  function unicodeGrid(list) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))" }}>
        {list.map((ch) => (
          <button
            key={ch}
            type="button"
            className="tappable"
            onClick={() => pickUnicode(ch)}
            style={{ ...cellBase, fontSize: 26, fontFamily: EMOJI_FONT }}
          >
            {ch}
          </button>
        ))}
      </div>
    );
  }

  function uploadTile(large) {
    if (!canUpload || !onUpload) return null;
    return (
      <button
        type="button"
        className="tappable"
        onClick={onUpload}
        style={{
          ...cellBase, height: large ? 76 : 44, flexDirection: "column", gap: 2,
          border: "1px dashed var(--border)", color: "var(--text-muted)", fontSize: 10,
        }}
      >
        <Plus size={large ? 20 : 16} />
        <span>Upload</span>
      </button>
    );
  }

  function renderBody() {
    if (activeTab.id === "recent") {
      const items = recents
        .map((t) => {
          if (t.startsWith(":") && t.endsWith(":")) {
            const e = byName.get(t.slice(1, -1));
            return e ? { kind: "custom", e } : null;
          }
          return { kind: "unicode", ch: t };
        })
        .filter(Boolean);
      if (items.length === 0) {
        return (
          <p className="text-xs text-center" style={{ color: "var(--text-muted)", padding: "28px 12px" }}>
            Emojis you use will show up here.
          </p>
        );
      }
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))" }}>
          {items.map((it) =>
            it.kind === "unicode" ? (
              <button
                key={it.ch}
                type="button"
                className="tappable"
                onClick={() => pickUnicode(it.ch)}
                style={{ ...cellBase, fontSize: 26, fontFamily: EMOJI_FONT }}
              >
                {it.ch}
              </button>
            ) : (
              <button
                key={it.e.id}
                type="button"
                className="tappable"
                onClick={() => pickCustom(it.e)}
                title={`:${it.e.name}:`}
                style={cellBase}
              >
                <img
                  src={it.e.imageDataUrl}
                  alt={it.e.name}
                  style={{ width: it.e.type === "sticker" ? 36 : 30, height: it.e.type === "sticker" ? 36 : 30, objectFit: "cover", borderRadius: 6 }}
                />
              </button>
            )
          )}
        </div>
      );
    }

    if (activeTab.id === "custom") {
      return (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))", gap: 2 }}>
            {emojiList.map((e) => (
              <button
                key={e.id}
                type="button"
                className="tappable"
                onClick={() => pickCustom(e)}
                title={`:${e.name}:`}
                style={cellBase}
              >
                <img src={e.imageDataUrl} alt={e.name} style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 6 }} />
              </button>
            ))}
            {uploadTile(false)}
          </div>
          {emojiList.length === 0 && !canUpload && (
            <p className="text-xs text-center" style={{ color: "var(--text-muted)", padding: "28px 12px" }}>
              This community has no custom emojis yet.
            </p>
          )}
        </>
      );
    }

    if (activeTab.id === "stickers") {
      return (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))", gap: 6 }}>
            {stickerList.map((e) => (
              <button
                key={e.id}
                type="button"
                className="tappable"
                onClick={() => pickCustom(e)}
                title={`:${e.name}:`}
                style={{ ...cellBase, height: 76 }}
              >
                <img src={e.imageDataUrl} alt={e.name} style={{ width: 68, height: 68, objectFit: "contain", borderRadius: 8 }} />
              </button>
            ))}
            {uploadTile(true)}
          </div>
          {stickerList.length === 0 && !canUpload && (
            <p className="text-xs text-center" style={{ color: "var(--text-muted)", padding: "28px 12px" }}>
              This community has no stickers yet.
            </p>
          )}
        </>
      );
    }

    return unicodeGrid(activeTab.emojis);
  }

  return (
    <div
      style={{
        height, display: "flex", flexDirection: "column",
        background: "var(--surface)", borderTop: "1px solid var(--border)",
        borderRadius: "16px 16px 0 0",
      }}
    >
      <div
        role="tablist"
        style={{ display: "flex", gap: 2, overflowX: "auto", padding: "8px 8px 4px", flexShrink: 0, scrollbarWidth: "none" }}
      >
        {tabs.map((t) => {
          const active = t.id === activeTab.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={t.label}
              title={t.label}
              className="tappable"
              onClick={() => setTab(t.id)}
              style={{
                flexShrink: 0, width: 40, height: 36, borderRadius: 10, border: "none",
                fontSize: 20, fontFamily: EMOJI_FONT,
                background: active ? "var(--accent-soft)" : "transparent",
                opacity: active ? 1 : 0.65,
              }}
            >
              {t.icon}
            </button>
          );
        })}
      </div>

      <div
        style={{
          padding: "2px 14px 6px", fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
          textTransform: "uppercase", color: "var(--text-muted)",
        }}
      >
        {activeTab.label}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "0 8px 10px" }}>
        {renderBody()}
      </div>
    </div>
  );
}