import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const OUT = "lib/changelog.generated.json";
mkdirSync("lib", { recursive: true });

// Only commits that start with "app:" are student-facing updates.
const PREFIX = /^app:\s*/i;

try {
  const raw = execFileSync(
    "git",
    ["log", "-n", "200", "--pretty=format:%cI%x1f%s%x1e"],
    { encoding: "utf8" }
  );
  const entries = raw
    .split("\x1e")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [date, subject] = r.split("\x1f");
      return { date: (date || "").slice(0, 10), change: (subject || "").trim() };
    })
    .filter((e) => PREFIX.test(e.change))
    .map((e) => ({ date: e.date, change: e.change.replace(PREFIX, "") }))
    .slice(0, 40);
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2));
} catch {
  if (!existsSync(OUT)) {
    writeFileSync(OUT, JSON.stringify({ generatedAt: null, entries: [] }, null, 2));
  }
}