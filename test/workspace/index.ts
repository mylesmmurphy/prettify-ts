/* eslint-disable @typescript-eslint/no-unused-vars */

// === Primitive Types ===
type StringPrimitive = string;
type TestPrimitiveObj = { value: StringPrimitive };

// === Template Literal Types ===
type TemplateLiteral = `user-${string}`;
type TestTemplateLiteralObj = { value: TemplateLiteral };

// === Mapped Types ===
type MappedInput = { a: number; b: string };
type Mapped = { [K in keyof MappedInput]: MappedInput[K] };
type TestMappedObj = { value: Mapped };

// === Conditional Types ===
type IsString<T> = T extends string ? "yes" : "no";
type Conditional = IsString<"abc">;
type TestConditionalObj = { value: Conditional };

// === Extends Primitive Type Argument ===
type ExtendedPrimitive<TString extends string> = TString;
type TestExtendedPrimitiveObj = { value: ExtendedPrimitive<string> };

// === Circular Types ===
type Circular = { value: string; next?: Circular };
type TestCircularObj = { value: Circular };

// === Unions ===
type Union = string | number;
type TestUnionObj = { value: Union };

// === Discriminated Unions ===
type Circle = { kind: "circle"; radius: number };
type Square = { kind: "square"; size: number };
type TestDiscriminatedUnion = Circle | Square;

// === Enum ===
enum TestEnum {
  OK,
  Fail,
}

// === Function - 1 Call Signature ===
type FunctionSingle = (x: number) => string;
type TestFunctionSingleObj = { value: FunctionSingle };

// === Function - Multiple Call Signatures ===
function overloadFunction(string: string): string;
function overloadFunction(number: number): number;
function overloadFunction(value: string | number): string | number {
  return value;
}
type TestFunctionMultipleObj = { value: typeof overloadFunction };

// === Function - Rest Parameter ===
type FunctionRestArg = (...args: number[]) => void;
type TestFunctionRestArgObj = { value: FunctionRestArg };

// === Function - Optional Parameter ===
type FunctionOptionalArg = (x?: string) => void;
type TestFunctionOptionalArgObj = { value: FunctionOptionalArg };

// === Tuple Type ===
type Tuple = [number, string];
type TestTupleObj = { value: Tuple };

// === Tuple Readonly ===
type ReadonlyTuple = readonly [boolean, boolean];
type TestReadonlyTupleObj = { value: ReadonlyTuple };

// === Array Type ===
type ArrayType = number[];
type TestArrayObj = { value: ArrayType };

// === Array Readonly ===
type ReadonlyArrayType = ReadonlyArray<string>;
type TestReadonlyArrayObj = { value: ReadonlyArrayType };

// === Generic Argument (Promise) ===
type Generic = Promise<string>;
type TestGenericObj = { value: Generic };

// === Object ===
type ObjectType = { a: number; b: string };
type TestObject = { value: ObjectType };

// === Object Merging ===
type ObjA = { a: string };
type ObjB = { b: number };
type TestObjectMerge = ObjA & ObjB;

// === Object Merging Never ===
type NeverObjA = { a: string };
type NeverObjB = { a: number };
type TestNeverObjectMerge = NeverObjA & NeverObjB;

// === Nested Object ===
type NestedObject = { x: { y: { z: string } } };
type TestNestedObject = { value: NestedObject };

// === Object Index Signature - Number / String ===
type IndexNumber = { [key: number]: string };
type TestIndexNumberObj = { value: IndexNumber };

type IndexString = { [key: string]: number };
type TestIndexStringObj = { value: IndexString };

// === Object String Template Index ===
type TemplateIndex = { [key: `item-${number}`]: boolean };
type TestTemplateIndexObj = { value: TemplateIndex };

// === Object Dynamic Index Key Name ===
type Keys = "a" | "b";
type DynamicIndex = { [K in Keys]: number };
type TestDynamicIndexObj = { value: DynamicIndex };

// === Object Index Readonly ===
type IndexReadonly = { readonly [key: string]: string };
type TestIndexReadonlyObj = { value: IndexReadonly };

// === Object Property Readonly ===
type ReadonlyProp = { readonly b: number };
type TestReadonlyPropObj = { value: ReadonlyProp };

// === Union Sorting Order ===
type TestUnionSort = string | number | { x: string } | null | undefined;
