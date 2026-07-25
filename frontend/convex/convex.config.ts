import { defineApp } from "convex/server";
import workflow from "@convex-dev/workflow/convex.config.js";

// Still mounted but no longer used: wave scheduling moved out of the Workflow
// component and into the completion callbacks (runs.finishPublic →
// agents.dispatchNextWave), because fire-and-forget dispatch means a workflow
// step can only await the *dispatch* of a wave, not its completion. Unmounting
// deletes the component's tables, which is a deliberate cleanup for another
// day, not a drive-by.
const app = defineApp();
app.use(workflow);
export default app;
