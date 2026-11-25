// What consumers code against: types only, no runtime code. Any code can import it, browser code
// included, without pulling in the module. Error classes appear here as types; a consumer that
// catches with instanceof imports the class from the root entry.
export type { SampleModule } from "./index.ts";
export type { SampleModuleConfig, SampleConfigError } from "./config/sample-config.ts";
export type { SampleLogger, LogFields } from "./logger.ts";
export type { Item } from "./items/domain/item.ts";
export type { SampleItemError } from "./items/domain/errors.ts";
export type { ItemErrorCode, CreateItemInput, RenameItemInput } from "./items-vocabulary.ts";
