// T11-1 문서 링크 검사: docs·backlogs 의 상대 링크가 모두 실재 파일을 가리킨다
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "vitest";

const root = join(import.meta.dirname, "../..");
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".md") ? [p] : [];
  });

test("T11-1 문서의 상대 링크가 모두 실재한다", () => {
  const broken: string[] = [];
  // 공개본에는 진행 중 작업 메모(backlogs/)를 싣지 않는다 — 있으면 검사하고, 그쪽을 가리키는 링크는 건너뛴다
  const hasBacklogs = existsSync(join(root, "backlogs"));
  for (const file of [...walk(join(root, "docs")), ...(hasBacklogs ? walk(join(root, "backlogs")) : [])]) {
    const md = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
    for (const m of md.matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = decodeURIComponent(m[1]!.split("#")[0]!);
      if (!href || /^[a-z]+:/i.test(href)) continue;
      if (!hasBacklogs && resolve(dirname(file), href).startsWith(join(root, "backlogs"))) continue;
      if (!existsSync(resolve(dirname(file), href))) broken.push(`${file.slice(root.length + 1)} → ${m[1]}`);
    }
  }
  expect(broken).toEqual([]);
});
