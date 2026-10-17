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

/** Same wording as earlier releases (`... 3 more`), inside a comment so copied output stays valid TypeScript. */
function omitted(count: number, separator = ""): string {
  return count > 0 ? " /* " + separator + "... " + count + " more */" : "";
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
        .join(" | ") + omitted(tree.excessMembers, "| ")
    );
  }
  if (tree.kind === "object") {
    if (!tree.properties.length && !tree.signatures?.length && !tree.excessProperties && !tree.excessSignatures)
      return "{}";
    const signatures = (tree.signatures ?? []).map((signature) => signatureText(signature, "call") + ";");
    const properties = tree.properties.map((property) => {
      // Canonical numeric keys stay bare (`0: string`); "01" or unsafe integers keep quotes to retain their identity.
      const name =
        property.computed ||
        /^[a-zA-Z_$][\w$]*$/.test(property.name) ||
        (/^(?:0|[1-9]\d*)$/.test(property.name) && Number.isSafeInteger(Number(property.name)))
          ? property.name
          : JSON.stringify(property.name);
      return (
        (property.readonly ? "readonly " : "") +
        name +
        (property.optional ? "?" : "") +
        ": " +
        stringifyTypeTree(property.type) +
        ";"
      );
    });
    const members = [...signatures, ...properties].join(" ");
    const markers = (omitted(tree.excessProperties) + omitted(tree.excessSignatures ?? 0)).trimStart();
    return "{ " + (members && markers ? members + " " + markers : members || markers) + " }";
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
      return signatureText(tree.signatures[0]!, context) + omitted(tree.excessSignatures);
    return (
      "{ " +
      tree.signatures.map((signature) => signatureText(signature, "call") + ";").join(" ") +
      omitted(tree.excessSignatures) +
      " }"
    );
  }
  if (tree.kind === "generic")
    return tree.typeName + "<" + tree.arguments.map((argument) => stringifyTypeTree(argument)).join(", ") + ">";
  if (tree.kind === "enum") return tree.member;
  return tree.typeName;
}

const NODE_MODULES = "node_modules/";

/**
 * Show `typeof import("/abs/path/node_modules/pkg/x")` as `typeof import("pkg/x")`, as earlier releases did.
 * Only module specifiers are rewritten; other string and template literal contents are left untouched.
 */
function shortenModulePaths(text: string): string {
  if (!text.includes(NODE_MODULES)) return text;
  let result = "";
  let copied = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length : end + 1;
    } else if (["'", '"', "`"].includes(character)) {
      const end = literalEnd(text, index);
      const at = text.indexOf(NODE_MODULES, index);
      if (character === '"' && text.endsWith("typeof import(", index) && at >= 0 && at < end) {
        result += text.slice(copied, index + 1);
        copied = at + NODE_MODULES.length;
      }
      index = end - 1;
    }
  }
  return result + text.slice(copied);
}

/** Format whitespace only. Quoted text, template literals, and comments are opaque. */
export function prettyPrintTypeString(input: string, indentation = 2): string {
  input = shortenModulePaths(input);
  const spaces = integerSetting(indentation, 4, 0);
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
  function skipSpace(from: number): number {
    while (from < input.length && /\s/.test(input[from]!)) from++;
    return from;
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
      const close = skipSpace(index + 1);
      const commentEnd = input.startsWith("/*", close) ? input.indexOf("*/", close + 2) : -1;
      if (input[close] === "}") {
        write("{}");
        index = close;
      } else if (commentEnd >= 0 && input[skipSpace(commentEnd + 2)] === "}") {
        // A collapsed object (`{ ... 2 more }`) stays on one line.
        write("{ " + input.slice(close, commentEnd + 2) + " }");
        index = skipSpace(commentEnd + 2);
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

/** The declaration prefix and the formatted type, rendered separately for hover deduplication. */
export function renderTypeParts(info: TypeInfo, indentation: number): { declaration: string; type: string } {
  let declaration = info.declaration;
  const tree = info.typeTree;
  if (declaration.startsWith("function")) {
    if (tree.kind === "function" && tree.signatures.length === 1) {
      // Constructors keep the familiar `function Foo(value: string): Foo` form.
      const signature = { ...tree.signatures[0]!, construct: false };
      const type = stringifyTypeTree({ ...tree, signatures: [signature] }, "declaration");
      return { declaration, type: prettyPrintTypeString(type, indentation) };
    }
    declaration = "const " + info.name + ": ";
  }
  return { declaration, type: prettyPrintTypeString(stringifyTypeTree(tree, "type"), indentation) };
}

const OMISSION_MARKER = /^\/\* (\| )?\.\.\. (\d+) more \*\/$/;

/**
 * Hover previews keep the compact markers of earlier releases (`{ ... 2 more }`, `a: 1; ... 2 more;`, `| ... 5 more`).
 * Copies keep the comment form so pasted output remains valid TypeScript.
 */
export function hoverMarkers(text: string): string {
  let result = "";
  let previous = "";
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    let piece = character;
    if (["'", '"', "`"].includes(character)) {
      const end = literalEnd(text, index);
      piece = text.slice(index, end);
      index = end - 1;
    } else if (text.startsWith("/*", index)) {
      const close = text.indexOf("*/", index + 2);
      const end = close < 0 ? text.length : close + 2;
      piece = text.slice(index, end);
      const match = OMISSION_MARKER.exec(piece);
      if (match?.[1]) piece = "| ... " + match[2] + " more";
      else if (match && previous === "{") piece = "... " + match[2] + " more";
      else if (match && previous === ";") piece = "... " + match[2] + " more;";
      index = end - 1;
    }
    result += piece;
    if (piece.trim()) previous = piece.trimEnd().slice(-1);
  }
  return result;
}

export function renderTypeInfo(info: TypeInfo, indentation: number): string {
  const { declaration, type } = renderTypeParts(info, indentation);
  return declaration + type;
}

/**
 * Sanitizes a string by removing leading words, whitespace, newlines, and semicolons.
 * Used only to decide whether TypeScript's own hover already shows the same type.
 */
export function sanitizeString(str: string): string {
  return str
    .replace(/^[a-z]+\s/, "") // Remove the leading word, ex: type, const, interface
    .replace(/\s/g, "") // Remove all whitespace
    .replace(/;/g, "") // Remove all semicolons
    .replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\./g, ""); // Remove namespaces (e.g., z.)
}
