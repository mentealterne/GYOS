# Evals

Eval cases for GYOS's skills, run with `claude plugin eval`. Each case is a paid Claude session,
so evals run locally, not in CI.

## Run

From the repo root:

```sh
claude plugin eval . --allow-tools Write --judge-model sonnet --trust-plugin --no-publish
```

- **`--allow-tools Write`** is required. The "nothing written" graders assert that no file is
  created, and without Write granted they would pass for free.
- **`--judge-model sonnet`.** The default judge (haiku) is too weak for the rubrics here.
- **`--ablation none`** skips the no-plugin baseline, which halves the cost. Use it when you only
  want to know whether the skill behaves, not how much it adds.
- **`--case <glob>` or `--tag <tag>`** runs a subset.

Results land in `evals/results/`, which is ignored by git.

## Cases

| Case | Checks |
| --- | --- |
| `discover/triggers` | A product idea plus "how do we structure it" wakes `/gyos:discover` |
| `discover/not-triggered` | A general DDD question doesn't |
| `discover/first-turn` | The first reply is one Socratic question with labelled proposals, and nothing is written |
| `discover/no-invention` | Pushed to skip the interview, every guess is labelled and nothing is written |

## Not covered yet

- **After checkpoint A:** once the user confirms the draft, exactly the brief and the map are
  created, with the GYOS header. Needs `context.history_file` to replay the interview up to the
  checkpoint.
- **Refine mode:** a scaffolded repo with an existing map and a user-written file, checking that
  nothing is regenerated or overwritten. Needs `context.scaffold_script` and `--scaffold`.
