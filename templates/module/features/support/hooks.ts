import { After, Status } from "@cucumber/cucumber";
import type { SampleWorld } from "./world.ts";

// When a scenario fails, attach what was stored, so the report shows the state it failed on.
After(async function (this: SampleWorld, { result }) {
  if (result?.status === Status.FAILED) {
    this.attach(JSON.stringify(this.items.all(), null, 2), "application/json");
  }
});
