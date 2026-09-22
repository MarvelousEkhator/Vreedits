import { DICTIONARIES } from "./i18n";
import chat from "./i18n-chat";
import aiTools from "./i18n-aitools";
import auth from "./i18n-auth";
import sections from "./i18n-sections";

// To translate another part of the app, create lib/i18n-<name>.js
// (same shape as i18n-chat.js), import it here, and add it to SECTIONS.
const SECTIONS = [chat, aiTools, auth, sections];

for (const section of SECTIONS) {
  for (const code of Object.keys(section)) {
    DICTIONARIES[code] = { ...(DICTIONARIES[code] || {}), ...section[code] };
  }
}