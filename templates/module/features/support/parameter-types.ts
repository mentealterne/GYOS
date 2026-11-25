import { defineParameterType } from "@cucumber/cucumber";

// A tenant is named in scenarios with a capitalised word: Acme, Globex.
defineParameterType({
  name: "tenant",
  regexp: /[A-Z][A-Za-z]*/,
  transformer: (name: string) => name,
});
