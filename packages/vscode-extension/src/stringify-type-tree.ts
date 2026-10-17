import type { TypeTree } from "@prettify-ts/typescript-plugin/src/type-tree/types";

/**
 * Regular expression to validate an object key that does not require quotes.
 */
const unquotedObjectKeyRegex = /^(?:\d+|[a-zA-Z_$][\w$]*)$/;

/**
 * Uses type info to return a string representation of the type
 *
 * Example:
 * { kind: 'union', types: [{ kind: 'primitive', type: 'string' }, { kind: 'primitive', type: 'number' }] }
 * Yields:
 * 'string | number'
 */
export function stringifyTypeTree(typeTree: TypeTree, anonymousFunction = true): string {
  if (typeTree.kind === "union") {
    const unionString = typeTree.types.map((t) => stringifyTypeTree(t)).join(" | ");

    if (typeTree.excessMembers > 0) {
      return `${unionString} | ... ${typeTree.excessMembers} more`;
    }

    return unionString;
  }

  if (typeTree.kind === "object") {
    const propertiesArray = typeTree.properties.map((p) => {
      const readonly = p.readonly ? "readonly " : "";

      const optional = p.optional ? "?" : "";
      if (p.optional && p.type.kind === "union") {
        // Remove undefined from union if optional
        p.type.types = p.type.types.filter((t) => t.typeName !== "undefined");
      }

      // If the name has invalid characters, wrap it in quotes
      let name = p.name;
      if (!p.computed && !unquotedObjectKeyRegex.test(p.name)) {
        name = JSON.stringify(p.name);
      }

      return `${readonly}${name}${optional}: ${stringifyTypeTree(p.type)};`;
    });

    let propertiesString = propertiesArray.join(" ");

    if (typeTree.excessProperties > 0) {
      propertiesString += ` ... ${typeTree.excessProperties} more;`;
    }

    return `{ ${propertiesString} }`;
  }

  if (typeTree.kind === "tuple") {
    const elements = typeTree.elements
      .map((element) => {
        let type = element.type;
        if (element.optional && type.kind === "union") {
          const types = type.types.filter((member) => member.typeName !== "undefined");
          type = types.length === 1 ? types[0]! : { ...type, types };
        }
        let typeString = stringifyTypeTree(type);
        const rest = element.rest ? "..." : "";
        const optional = element.optional ? "?" : "";
        if (element.name) return `${rest}${element.name}${optional}: ${typeString}`;
        if (element.optional && (type.kind === "union" || type.kind === "function")) {
          typeString = `(${typeString})`;
        }
        return `${rest}${typeString}${optional}`;
      })
      .join(", ");

    return `${typeTree.readonly ? "readonly " : ""}[${elements}]`;
  }

  if (typeTree.kind === "array") {
    let elementTypeString = stringifyTypeTree(typeTree.elementType);
    if (
      typeTree.elementType.kind === "function" ||
      elementTypeString.includes("|") ||
      elementTypeString.includes("&")
    ) {
      elementTypeString = `(${elementTypeString})`;
    }

    return `${typeTree.readonly ? "readonly " : ""}${elementTypeString}[]`;
  }

  if (typeTree.kind === "function") {
    const returnTypeChar = anonymousFunction ? " =>" : ":";

    const signatures = typeTree.signatures.map((s) => {
      const { parameters, returnType } = s;
      const parametersArray = parameters.map((p) => {
        const rest = p.isRestParameter ? "..." : "";

        const optional = p.optional ? "?" : "";
        if (p.optional && p.type.kind === "union") {
          // Remove undefined from union if optional
          p.type.types = p.type.types.filter((t) => t.typeName !== "undefined");
        }

        return `${rest}${p.name}${optional}: ${stringifyTypeTree(p.type)}`;
      });

      const parametersString = parametersArray.join(", ");

      return `(${parametersString})${returnTypeChar} ${stringifyTypeTree(returnType)}`;
    });

    // If there are multiple signatures, wrap them in braces with semi-colons at the end of each line
    if (signatures.length > 1) {
      let signaturesString = `{${signatures.join("; ")};`;
      if (typeTree.excessSignatures > 0) {
        signaturesString += ` ... ${typeTree.excessSignatures} more;`;
      }
      signaturesString += "}";

      return signaturesString;
    }

    return signatures[0] ?? "";
  }

  if (typeTree.kind === "enum") {
    return typeTree.member;
  }

  if (typeTree.kind === "generic") {
    const argumentsString = typeTree.arguments.map((arg) => stringifyTypeTree(arg)).join(", ");
    return `${typeTree.typeName}<${argumentsString}>`;
  }

  // Primitive or reference type
  return typeTree.typeName;
}

export function prettyPrintTypeString(typeStringInput: string, indentation = 2): string {
  // Replace typeof import("...node_modules/MODULE_NAME") with: typeof import("MODULE_NAME")
  const typeString = typeStringInput.replace(/typeof import\(".*?node_modules\/(.*?)"\)/g, 'typeof import("$1")');

  // Keep punctuation and whitespace inside quoted names and literal types unchanged.
  const literals: string[] = [];
  const maskedTypeString = typeString.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, (literal) => {
    const index = literals.push(literal) - 1;
    return `\uE000${index}\uE001`;
  });

  const restoreLiterals = (text: string): string =>
    text.replace(/\uE000(\d+)\uE001/g, (_, index: string) => literals[Number(index)]!);
  const normalizedTypeString = maskedTypeString.replace(/ } & { /g, " ");
  if (indentation < 1) return restoreLiterals(normalizedTypeString);

  // Add newline after braces and semicolons
  const splitTypeString = normalizedTypeString
    .replace(/{/g, "{\n")
    .replace(/}/g, "\n}")
    .replace(/(\S); /g, "$1;\n ");

  let depth = 0;
  let result = "";

  const lines = splitTypeString.split("\n");

  for (let line of lines) {
    line = line.trim();

    // Replace true/false with boolean
    line = line.replace("false | true", "boolean");

    const hasOpenBrace = line.includes("{");
    const hasCloseBrace = line.includes("}");

    if (hasCloseBrace) {
      depth--;
    }

    result += " ".repeat(indentation).repeat(depth) + line + "\n";

    if (hasOpenBrace) {
      depth++;
    }
  }

  result = result
    .replace(/{\s*\n*\s*}/g, "{}") // Remove empty braces newlines
    .replace(/^\s*[\r\n]/gm, "") // Remove empty newlines
    .replace(/{\s*\.\.\.\s*([0-9]+)\s*more;\s*}/g, "{ ... $1 more }") // Replace only excess properties into one line
    .replace(/\$\{\s*([^{}]+?)\s*\}/g, (_, inner) => `\${${inner}}`); // Remove unnecessary spaces in template literals

  return restoreLiterals(result);
}

/**
 * Sanitizes a string by removing leading words, whitespace, newlines, and semicolons
 */
export function sanitizeString(str: string): string {
  return str
    .replace(/^[a-z]+\s/, "") // Remove the leading word, ex: type, const, interface
    .replace(/\s/g, "") // Remove all whitespace
    .replace(/\n/g, "") // Remove all newlines
    .replace(/;/g, "") // Remove all semicolons
    .replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\./g, ""); // Remove namespaces (e.g., z.)
}
