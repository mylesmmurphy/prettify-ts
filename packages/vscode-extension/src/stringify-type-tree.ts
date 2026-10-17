import type { TypeFunctionSignature, TypeInfo, TypeTree } from "@prettify-ts/typescript-plugin/src/type-tree/types";
import { integerSetting } from "@prettify-ts/typescript-plugin/src/options";

type RenderContext = "type" | "declaration" | "call";

function signatureText(signature: TypeFunctionSignature, context: RenderContext): string {
  const generics = signature.typeParameters?.length
    ? "<" +
      signature.typeParameters
        .map(
          (parameter) =>
            (parameter.modifiers?.length ? parameter.modifiers.join(" ") + " " : "") +
            parameter.name +
            (parameter.constraint ? " extends " + stringifyTypeTree(parameter.constraint) : "") +
            (parameter.default ? " = " + stringifyTypeTree(parameter.default) : ""),
        )
        .join(", ") +
      ">"
    : "";
  const parameters = signature.parameters
    .map(
      (parameter) =>
        (parameter.isRestParameter ? "..." : "") +
        parameter.name +
        (parameter.optional ? "?" : "") +
        ": " +
        stringifyTypeTree(parameter.type),
    )
    .join(", ");
  const predicate = signature.predicate;
  const result = predicate
    ? (predicate.asserts ? "asserts " : "") +
      predicate.parameter +
      (predicate.type ? " is " + stringifyTypeTree(predicate.type) : "")
    : stringifyTypeTree(signature.returnType);
  return (
    (signature.construct ? "new " : "") +
    generics +
    "(" +
    parameters +
    ")" +
    (context === "type" ? " => " : ": ") +
    result
  );
}

function omitted(count: number, label: string): string {
  return count > 0 ? " /* ... " + count + " more " + label + " */" : "";
}

/** Index just past the quoted or template literal starting at `start`, including nested `${}` expressions. */
function literalEnd(text: string, start: number): number {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }
    if (text[index] === quote) return index + 1;
    if (quote === "`" && text[index] === "$" && text[index + 1] === "{") {
      index += 2;
      let braces = 1;
      while (index < text.length && braces) {
        if (["'", '"', "`"].includes(text[index]!)) index = literalEnd(text, index);
        else {
          if (text[index] === "{") braces++;
          if (text[index] === "}") braces--;
          index++;
        }
      }
    } else index++;
  }
  return index;
}

/**
 * Whether opaque type text must be parenthesized as a union member or array element.
 * Only syntax at bracket depth zero matters: `Foo<A | B>` is safe, `() => A` and `A extends B ? C : D` are not.
 */
function needsGrouping(text: string, arrayElement: boolean): boolean {
  if (arrayElement && /^(?:keyof|readonly|unique|infer)\s/.test(text)) return true;
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (["'", '"', "`"].includes(character)) index = literalEnd(text, index) - 1;
    else if (text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length : end + 1;
    } else if (text.startsWith("=>", index)) {
      if (!depth) return true;
      index++;
    } else if ("([{<".includes(character)) depth++;
    else if (")]}>".includes(character)) depth--;
    else if (!depth && (character === "?" || (arrayElement && (character === "|" || character === "&")))) return true;
  }
  return false;
}

/** Pure serialization with explicit syntax contexts and precedence. */
export function stringifyTypeTree(tree: TypeTree, anonymousFunction: boolean | RenderContext = true): string {
  const context =
    typeof anonymousFunction === "boolean" ? (anonymousFunction ? "type" : "declaration") : anonymousFunction;
  if (tree.kind === "union") {
    let types = tree.types;
    const booleans = types.filter(
      (member) => member.kind === "primitive" && ["false", "true"].includes(member.typeName),
    );
    if (booleans.length === 2) {
      // Collapse `false | true` where it first appears, as quick info does (`boolean | null`).
      types = types.flatMap((member) =>
        member === booleans[0]
          ? [{ kind: "primitive", typeName: "boolean" } as const]
          : booleans.includes(member)
            ? []
            : [member],
      );
    }
    return (
      types
        .map((member) => {
          const text = stringifyTypeTree(member);
          return (member.kind === "function" && member.signatures.length === 1) ||
            ((member.kind === "reference" || member.kind === "primitive") && needsGrouping(text, false))
            ? "(" + text + ")"
            : text;
        })
        .join(" | ") + omitted(tree.excessMembers, "union members")
    );
  }
  if (tree.kind === "object") {
    if (!tree.properties.length && !tree.signatures?.length && !tree.excessProperties && !tree.excessSignatures)
      return "{}";
    const signatures = (tree.signatures ?? []).map((signature) => signatureText(signature, "call") + ";");
    const properties = tree.properties.map((property) => {
      // Digit-only string keys retain their identity, including leading zeroes and large integers.
      const name =
        property.computed || /^[a-zA-Z_$][\w$]*$/.test(property.name) ? property.name : JSON.stringify(property.name);
      return (
        (property.readonly ? "readonly " : "") +
        name +
        (property.optional ? "?" : "") +
        ": " +
        stringifyTypeTree(property.type) +
        ";"
      );
    });
    return (
      "{ " +
      [...signatures, ...properties].join(" ") +
      omitted(tree.excessProperties, "properties") +
      omitted(tree.excessSignatures ?? 0, "signatures") +
      " }"
    );
  }
  if (tree.kind === "tuple") {
    return (
      (tree.readonly ? "readonly " : "") +
      "[" +
      tree.elements
        .map((element) => {
          let text = stringifyTypeTree(element.type);
          const rest = element.rest ? "..." : "";
          if (element.name) return rest + element.name + (element.optional ? "?" : "") + ": " + text;
          if (element.optional && (element.type.kind === "union" || element.type.kind === "function"))
            text = "(" + text + ")";
          return rest + text + (element.optional ? "?" : "");
        })
        .join(", ") +
      "]"
    );
  }
  if (tree.kind === "array") {
    const element = tree.elementType;
    let text = stringifyTypeTree(element);
    if (
      element.kind === "union" ||
      element.kind === "function" ||
      ((element.kind === "array" || element.kind === "tuple") && element.readonly) ||
      ((element.kind === "reference" || element.kind === "primitive") && needsGrouping(text, true))
    )
      text = "(" + text + ")";
    return (tree.readonly ? "readonly " : "") + text + "[]";
  }
  if (tree.kind === "function") {
    if (tree.signatures.length === 1)
      return signatureText(tree.signatures[0]!, context) + omitted(tree.excessSignatures, "signatures");
    return (
      "{ " +
      tree.signatures.map((signature) => signatureText(signature, "call") + ";").join(" ") +
      omitted(tree.excessSignatures, "signatures") +
      " }"
    );
  }
  if (tree.kind === "generic")
    return tree.typeName + "<" + tree.arguments.map((argument) => stringifyTypeTree(argument)).join(", ") + ">";
  if (tree.kind === "enum") return tree.member;
  return tree.typeName;
}

/** Format whitespace only. Quoted text, template literals, and comments are opaque. */
export function prettyPrintTypeString(input: string, indentation = 2): string {
  const spaces = integerSetting(indentation, 4, 0, 8);
  if (!spaces) return input;
  // Build completed lines separately so formatting stays linear in the input size.
  const lines: string[] = [];
  let depth = 0;
  let line = "";
  let lineStart = true;
  function write(text: string) {
    if (lineStart && text.trim()) {
      line = " ".repeat(depth * spaces);
      lineStart = false;
    }
    line += text;
  }
  function newline() {
    const trimmed = line.trimEnd();
    if (trimmed) lines.push(trimmed);
    line = "";
    lineStart = true;
  }
  for (let index = 0; index < input.length; index++) {
    const character = input[index]!;
    if (["'", '"', "`"].includes(character)) {
      const end = literalEnd(input, index);
      write(input.slice(index, end));
      index = end - 1;
    } else if (input.startsWith("/*", index)) {
      const end = input.indexOf("*/", index + 2);
      const stop = end < 0 ? input.length : end + 2;
      write(input.slice(index, stop));
      index = stop - 1;
    } else if (character === "{") {
      let close = index + 1;
      while (close < input.length && /\s/.test(input[close]!)) close++;
      if (input[close] === "}") {
        write("{}");
        index = close;
      } else {
        write("{");
        depth++;
        newline();
      }
    } else if (character === "}") {
      depth = Math.max(0, depth - 1);
      newline();
      write("}");
    } else if (character === ";") {
      write(";");
      newline();
    } else if (/\s/.test(character)) {
      if (!lineStart && !line.endsWith(" ")) write(" ");
    } else write(character);
  }
  newline();
  return lines.join("\n") + "\n";
}

export function renderTypeInfo(info: TypeInfo, indentation: number): string {
  let declaration = info.declaration;
  const tree = info.typeTree;
  if (declaration.startsWith("function")) {
    if (tree.kind === "function" && tree.signatures.length === 1 && !tree.signatures[0]!.construct) {
      return declaration + prettyPrintTypeString(stringifyTypeTree(tree, "declaration"), indentation);
    }
    declaration = "const " + info.name + ": ";
  }
  return declaration + prettyPrintTypeString(stringifyTypeTree(tree, "type"), indentation);
}

/** Preserve literal contents and namespaces; deduplication must not erase type semantics. */
export function sanitizeString(str: string): string {
  return str.trim();
}
