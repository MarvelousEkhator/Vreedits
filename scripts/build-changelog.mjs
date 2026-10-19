import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const OUT = "lib/changelog.generated.json";
mkdirSync("lib", { recursive: true });

try {
  const raw = execFileSync(
    "git",
    ["log", "-n", "40", "--pretty=format:%cI%x1f%s%x1e"],
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
    .filter((e) => e.change && !/^merge /i.test(e.change));
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2));
} catch {
  if (!existsSync(OUT)) {
    writeFileSync(OUT, JSON.stringify({ generatedAt: null, entries: [] }, null, 2));
  }
}