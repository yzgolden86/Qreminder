#!/usr/bin/env node
import { runImport, type ImportOptions } from "./index.js";

function parseArgs(argv: string[]): ImportOptions {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key && key.startsWith("--")) {
      const value = argv[i + 1] ?? "";
      args.set(key.slice(2), value);
      i++;
    }
  }

  const pbDataDir = args.get("pb");
  const targetSpec = args.get("target");
  if (!pbDataDir || !targetSpec) {
    console.error(
      "usage: qreminder-import --pb <pb_data> --target sqlite:///data/db.sqlite [--fs /data/assets] [--dry-run]",
    );
    process.exit(2);
  }

  const dryRun = args.has("dry-run");

  if (targetSpec.startsWith("sqlite://")) {
    const fsDir = args.get("fs");
    if (!fsDir) {
      console.error("sqlite target requires --fs <assets-dir>");
      process.exit(2);
    }
    return {
      pbDataDir,
      target: {
        kind: "sqlite",
        databasePath: targetSpec.slice("sqlite://".length),
        assetsDir: fsDir,
      },
      dryRun,
    };
  }

  if (targetSpec.startsWith("d1://")) {
    const r2 = args.get("r2");
    if (!r2) {
      console.error("d1 target requires --r2 <bucket>");
      process.exit(2);
    }
    return {
      pbDataDir,
      target: {
        kind: "d1",
        databaseName: targetSpec.slice("d1://".length),
        r2Bucket: r2,
      },
      dryRun,
    };
  }

  console.error(`unsupported target: ${targetSpec}`);
  process.exit(2);
}

const options = parseArgs(process.argv.slice(2));
const report = await runImport(options);
console.log(JSON.stringify(report, null, 2));
