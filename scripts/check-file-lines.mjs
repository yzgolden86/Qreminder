#!/usr/bin/env node

/**
 * check-file-lines.mjs 检查手写文件是否超过默认 600 行的上限。
 *
 * 架构位置：根 package script 和 test:all 会调用该守卫，防止拆分后的源码、
 * 测试、样式、脚本与 i18n 文件再次膨胀到难以维护。
 *
 * Caveat: 这里刻意排除锁文件、生成索引、构建产物和 PocketBase 数据目录；
 * 新增生成物目录时必须同步 EXCLUDED_PATHS，否则守卫会把机器生成内容误报为手写代码。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const DEFAULT_LIMIT = 600;
const limit = Number.parseInt(process.env.FILE_LINE_LIMIT ?? String(DEFAULT_LIMIT), 10);

const CHECKED_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".jsx",
  ".json",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
  ".md",
]);

const EXCLUDED_PATHS = [
  /^pnpm-lock\.yaml$/,
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)coverage\//,
  /^packages\/client\/src\/lib\/thesvg-index\.json$/,
  /^packages\/server-ts\/drizzle\/meta\//,
  /^packages\/client\/src\/i18n\/messages\//,
  /^Qreminder_development_roadmap\.md$/,
];

function trackedAndNewFiles() {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  return output.split("\n").filter(Boolean);
}

function extensionOf(file) {
  const index = file.lastIndexOf(".");
  return index >= 0 ? file.slice(index) : "";
}

function shouldCheck(file) {
  if (!CHECKED_EXTENSIONS.has(extensionOf(file))) return false;
  return !EXCLUDED_PATHS.some((pattern) => pattern.test(file));
}

function lineCount(file) {
  const text = readFileSync(file, "utf8");
  if (text.length === 0) return 0;
  return text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length;
}

const violations = trackedAndNewFiles()
  .filter((file) => existsSync(file))
  .filter(shouldCheck)
  .map((file) => ({ file, lines: lineCount(file) }))
  .filter((entry) => entry.lines > limit)
  .sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));

if (violations.length > 0) {
  console.error(`File line limit exceeded (${limit} lines):`);
  for (const violation of violations) {
    console.error(`${String(violation.lines).padStart(5, " ")} ${violation.file}`);
  }
  process.exit(1);
}

console.log(`All checked hand-written files are <= ${limit} lines.`);
