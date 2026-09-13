import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { rust } from "@codemirror/lang-rust";
import { php } from "@codemirror/lang-php";
import { StreamLanguage } from "@codemirror/language";
import { csharp, kotlin } from "@codemirror/legacy-modes/mode/clike";
import { go } from "@codemirror/legacy-modes/mode/go";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { shell } from "@codemirror/legacy-modes/mode/shell";

export const CODE_ROOM_LANGUAGES = [
  { value: "javascript", label: "JavaScript", extension: () => javascript({ jsx: true }) },
  { value: "typescript", label: "TypeScript", extension: () => javascript({ jsx: true, typescript: true }) },
  { value: "python", label: "Python", extension: () => python() },
  { value: "java", label: "Java", extension: () => java() },
  { value: "c", label: "C", extension: () => cpp() },
  { value: "cpp", label: "C++", extension: () => cpp() },
  { value: "csharp", label: "C#", extension: () => StreamLanguage.define(csharp) },
  { value: "go", label: "Go", extension: () => StreamLanguage.define(go) },
  { value: "rust", label: "Rust", extension: () => rust() },
  { value: "ruby", label: "Ruby", extension: () => StreamLanguage.define(ruby) },
  { value: "php", label: "PHP", extension: () => php() },
  { value: "kotlin", label: "Kotlin", extension: () => StreamLanguage.define(kotlin) },
  { value: "swift", label: "Swift", extension: () => StreamLanguage.define(swift) },
  { value: "bash", label: "Bash", extension: () => StreamLanguage.define(shell) },
];

export function getLanguageExtension(value) {
  const entry = CODE_ROOM_LANGUAGES.find((l) => l.value === value);
  return entry ? entry.extension() : CODE_ROOM_LANGUAGES[0].extension();
}