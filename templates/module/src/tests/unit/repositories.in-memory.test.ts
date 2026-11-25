// The repositories' contract on the in-memory twin the scenarios use. The integration tier runs
// the same suite on Postgres (src/tests/integration/item-repository.test.ts).
import { createInMemorySampleRepositories } from "../../../features/support/in-memory-repositories.ts";
import { describeRepositoriesContract } from "../contract/repositories.contract.ts";

describeRepositoriesContract("in memory", async () => createInMemorySampleRepositories());
