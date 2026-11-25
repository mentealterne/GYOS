// Scenarios run against the controllers, wired to the in-memory adapters in features/support.
export default {
  paths: ["features/**/*.feature"],
  import: ["./tsx-register.js", "features/support/**/*.ts", "features/steps/**/*.ts"],
  format: ["progress", "html:reports/cucumber.html"],
};
