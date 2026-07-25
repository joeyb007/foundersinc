import { defineApp } from "convex/server";
import workflow from "@convex-dev/workflow/convex.config.js";

// `app.use` only accepts { name, httpPrefix } — parallelism is a workpool
// setting, so it lives on the WorkflowManager in workflows.ts instead.
const app = defineApp();
app.use(workflow);
export default app;
