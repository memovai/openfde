import { Command } from "commander";
import { registerEngagement } from "./commands/engagement.js";
import { registerIngest } from "./commands/ingest.js";
import { registerExtract } from "./commands/extract.js";
import { registerRecall } from "./commands/recall.js";
import { registerRemember } from "./commands/remember.js";
import { registerTask } from "./commands/task.js";
import { registerContext } from "./commands/context.js";
import { registerInterview } from "./commands/interview.js";
import { registerReport } from "./commands/report.js";
import { registerStatus } from "./commands/status.js";
import { registerServe } from "./commands/serve.js";
import { registerShare } from "./commands/share.js";

const program = new Command();
program
  .name("openfde")
  .description(
    "Local engagement memory for forward deployed engineers: interviews in, traceable memory out",
  )
  .version("0.1.0");

registerEngagement(program);
registerIngest(program);
registerExtract(program);
registerRecall(program);
registerRemember(program);
registerTask(program);
registerContext(program);
registerInterview(program);
registerReport(program);
registerStatus(program);
registerServe(program);
registerShare(program);

program.parseAsync(process.argv);
