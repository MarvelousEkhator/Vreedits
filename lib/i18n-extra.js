import { DICTIONARIES } from "./i18n";
import chat from "./i18n-chat";
import aiTools from "./i18n-aitools";

// To translate another part of the app, create lib/i18n-<name>.js
// (same shape as i18n-chat.js), import it here, and add it to SECTIONS.
const SECTIONS = [chat, aiTools];

for (const section of SECTIONS) {
  for (const code of Object.keys(section)) {
    DICTIONARIES[code] = { ...(DICTIONARIES[code] || {}), ...section[code] };
  }
}