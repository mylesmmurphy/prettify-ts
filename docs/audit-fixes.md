# Audit remediation coverage

All numbered findings from the October 17 audit are addressed in this change. Type output remains a preview: explicit presentation limits, cycles, and internal safety limits are reported rather than claiming a complete expansion.

| Finding | Implementation | Regression coverage |
| --- | --- | --- |
| 1. Unbounded traversal/full copy | Request-local node/depth/time/text/response budgets; bounded full-copy policy; cancellation | Recursive generic functions/objects and client cancellation |
| 2. Invalid function syntax | Explicit type/declaration/call rendering contexts | Root functions, overload objects, parser checks |
| 3. Lost signature semantics | Generic binders/modifiers/constraints/defaults, this parameters, predicates/assertions | Generic and predicate equivalence tests |
| 4. Mapped modifiers | Resolved optional flags and compiler check flags; getter-only readonly | Partial, Required, Readonly, +/-readonly, optional methods |
| 5. Lost callable/construct members | Object nodes retain signatures together with properties/indexes | Mixed callable/construct/indexed objects |
| 6. Precedence | Parenthesize union functions and readonly array/tuple elements | Parser/equivalence tests for nested readonly arrays |
| 7. Explicit undefined | Extraction distinguishes optional markers; pure rendering | Exact optional properties/tuples and mutation test |
| 8. Constructors/default parameters | Resolved new-expression signatures and initializer cardinality | Overloads, inferred generics, heritage, default-before-required |
| 9. Numeric keys | Preserve digit-only key quotes | Leading zero and unsafe-integer names |
| 10. Unsafe string rewrites | Formatting only changes whitespace, with opaque literals/comments | Intersections and import-like template text |
| 11. Native completions | Forward formatting settings and preserve receiver | Four-argument passthrough |
| 12. Unsaved URIs | Let the TypeScript extension map document URIs; route requests to the semantic server | Actual untitled hover and clipboard integration |
| 13. Toggle scope | Update the effective language/folder/workspace/user override | Mock language overrides and real workspace toggle |
| 14. Missing quickinfo | Optional deduplication, typed responses, logged failures | Missing/failed quickinfo still produces hover |
| 15. Settings conflicts | Functional deprecated Promise override; nonconflicting default skip lists | Promise override and shared-default assertions |
| 16. Generic aliases | Read alias symbols/type arguments | Configured alias wrapper regression |
| 17. Limit contracts | Total property cap, bounded integers, explicit omission comments; documented copy policy | Nested budget, one-overload omission, normalization, copy limits |
| 18. Hidden type strings | Structural nodes omit unused full names; reference/text/response limits | 10,000-property fixture response-size assertion |
| 19. AST lookup | Prune branches outside the range | Irrelevant subtree must never be visited |
| 20. Editor compatibility | Minimum VS Code 1.100.0, matching typings and test baseline | Minimum/current editor CI |
| 21. Packaging mutation | Isolated staging with finally cleanup | Failure preserves manifest/symlink; installed VSIX integration |

The Vue generated-offset-zero edge case is also fixed and covered by a mapping-level test.

Additional design changes centralize defaults/configuration/client requests, remove mutable compiler globals, reject stale results, expose progress and cancellation, activate only for supported languages, and show copy menus consistently in TS/TSX/JS/JSX/Vue. CI includes Windows and Linux integration, and the packaged VSIX is exercised on Linux.

Compiler internals required for mapped readonly and Vue integration remain isolated concerns. The compatibility matrix tests known compiler/editor combinations rather than promising every historical workspace TypeScript version.
