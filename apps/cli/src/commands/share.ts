import type { Command } from "commander";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { resolveEngagement } from "@openfde/core";
import { serve } from "@openfde/webui";
import { fail } from "../lib/helpers.js";

function lanAddresses(): string[] {
  const addresses: string[] = [];
  for (const nets of Object.values(networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === "IPv4" && !net.internal) addresses.push(net.address);
    }
  }
  return addresses;
}

export function registerShare(program: Command): void {
  program
    .command("share")
    .description(
      "Share a live, read-only executive report on your local network (for the customer's boss)",
    )
    .option("-p, --port <port>", "port to listen on", "4517")
    .option("-e, --engagement <slug>", "engagement to share (defaults to current)")
    .action((options: { port: string; engagement?: string }) => {
      try {
        const engagement = resolveEngagement(options.engagement);
        const token = randomBytes(16).toString("base64url");
        const port = Number(options.port);

        serve({ port, host: "0.0.0.0", share: { token, engagement } });

        const path = `/s/${token}/report`;
        const urls = lanAddresses().map((ip) => `http://${ip}:${port}${path}`);
        console.log("");
        console.log(`Sharing the live report for "${engagement}".`);
        if (urls.length === 0) {
          console.log(`No LAN address detected; share http://<your-ip>:${port}${path}`);
        } else {
          for (const url of urls) console.log(`  ${url}`);
        }
        console.log("");
        console.log("The link exposes the report only (read-only, auto-updating).");
        console.log("Your workspace stays loopback-only. Ctrl+C revokes the link.");
      } catch (error) {
        fail(error);
      }
    });
}
