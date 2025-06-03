TYPES Test - hover-types.test.ts:
Primitive types
Template literal types
Mapped types - type Mapped<T> = { [K in keyof T]: T[K] }
Conditional types
Extends primitive type
Circular types - recursive
Unions
Discriminated unions
Enum
Function 1 call signature
Function multiple call signatures
Function rest parameter
Function optional parameter
Tuple type
Tuple read only
Array type
Array read only
Generic argument (promise)
Object
Object merging
Nested Object
Object index signature number / string
Object string template index
Object dynamic index key name
Object index read only
Object property read only vs undefined
Object property read only
Union sorting order

Declaration Test - hover-declarations.test.ts:
Test all declaration kinds and hover types: const, let, var, function, type, interface, class, typeof import(""), constructor

Commands - commands.test.ts:
Copy prettified type
Copy fully prettified type

Settings, all user settings - settings.test.ts:
Type Indentation
Max Depth
Max Properties
Max Sub-Properties
Max Union Members
Max Function Signatures
Unwrap Functions
Unwrap Arrays
Unwrap Generic Arguments Type Names
Hide Private Properties**: If enabled, hides private properties and methods.
Skipped Type Names
Max Characters

Helpers
getHover(filename: string, keyword: string) // Name of file in workspace, text to hover over, promise of hover contents from extension (can I filter down to just my extension's hover?)
assertHoverContains
applySettings
