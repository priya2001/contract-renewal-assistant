import { fileURLToPath } from "node:url";
const [command, ...args] = process.argv.slice(2);
if (!["dev", "build", "start", "typegen"].includes(command))
  throw new Error("Expected dev, build, start or typegen");
process.env.CLAUSEDESK_TARGET = "vercel";
process.env.NEXT_PUBLIC_DEPLOYMENT_TARGET = "vercel";
const cli = new URL("../node_modules/next/dist/bin/next", import.meta.url);
process.argv = [
  process.execPath,
  fileURLToPath(cli),
  command,
  ...(command === "dev" || command === "build" ? ["--webpack"] : []),
  ...(command === "dev" || command === "start"
    ? ["--hostname", "127.0.0.1"]
    : []),
  ...args,
];
await import(cli.href);
