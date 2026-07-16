import { Command } from "commander";
import { registerEngagement } from "./commands/engagement.js";
import { registerIngest } from "./commands/ingest.js";
import { registerExtract } from "./commands/extract.js";
import { registerRecall } from "./commands/recall.js";
import { registerRemember } from "./commands/remember.js";
import { registerTask } from "./commands/task.js";
import { registerContext } from "./commands/context.js";
import { registerAsset } from "./commands/asset.js";
import { registerDatamap } from "./commands/datamap.js";
import { registerCanvas } from "./commands/canvas.js";
import { registerFlows } from "./commands/flows.js";
import { registerPage } from "./commands/page.js";
import { registerDemo } from "./commands/demo.js";
import { registerEval } from "./commands/eval.js";
import { registerInterview } from "./commands/interview.js";
import { registerResearch } from "./commands/research.js";
import { registerReport } from "./commands/report.js";
import { registerStatus } from "./commands/status.js";
import { registerServe } from "./commands/serve.js";
import { registerShare } from "./commands/share.js";

const program = new Command();
program
  .name("openfde")
  .description(
    "AI workspace for forward deployed engineers — deliver AI solutions 100x faster",
  )
  .version("0.1.0");

registerEngagement(program);
registerIngest(program);
registerExtract(program);
registerRecall(program);
registerRemember(program);
registerTask(program);
registerContext(program);
registerResearch(program);
registerDemo(program);
registerEval(program);
registerAsset(program);
registerCanvas(program);
registerDatamap(program);
registerFlows(program);
registerPage(program);
registerInterview(program);
registerReport(program);
registerStatus(program);
registerServe(program);
registerShare(program);

program.parseAsync(process.argv);
