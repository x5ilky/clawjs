# Claw
**Claw** is *intended* to be a language that compiles into a `.sb3` file to be run in TurboWarp, or just the vanilla scratch engine.

## Roadmap
| Goal                  | Completed? |
| --------------------- | ---------- |
| IR -> sb3             | ☑          |
| Language Design       | ☑          |
| Lexer                 | ☑          |
| Parser                | ☑          |
| Typechecker           | ☑          |
| Transpiler            | ☑          |
| Full standard library | ☐          |
> Typecheck is way too slow right now though because of some `structuredClone` shanenigans
> Trying to fix that right now

## Documentation

As of writing this document, only the IR has been fully completed.
I do not *yet* intend to write documentation for the IR, but if you are curious to the format, look at some files in the `examples/bytecode/` directory or look at `ir/parser.ts/`.