/* eslint-disable @typescript-eslint/no-unused-vars */

const SharedTypeFirst = { runtimeOnly: 123 };
type SharedTypeFirst = { typeOnly: string };

type SharedValueFirst = { typeOnly: string };
const SharedValueFirst = { runtimeOnly: 123 };

type DeclaredProbe = { nested: { value: string } };
const declaredProbe: DeclaredProbe = { nested: { value: "test" } };

const sharedReference: SharedTypeFirst = { typeOnly: "test" };
const sharedValueReference = SharedValueFirst;

class DeclarationClass {
  static staticMember = 1;
  constructor(public instanceValue: string) {}
}
const declarationInstance = new DeclarationClass("test");
enum DeclarationEnum {
  First,
  Second,
}
