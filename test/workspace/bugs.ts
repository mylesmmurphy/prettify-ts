/* eslint-disable @typescript-eslint/no-unused-vars */

const bugSymbol: unique symbol = Symbol("key");
type BugMappedSymbol = { [K in typeof bugSymbol]: "mapped" };
type BugObjectKeys = {
  [bugSymbol]: "symbol";
  [Symbol.iterator]: () => string;
  "quoted key": string;
  'quote"key': number;
  "back\\slash": boolean;
  "line\nbreak": number;
  "[literal]": string;
  "brace}key{": "false | true";
  "semi; colon": string;
  "merge } & { key": string;
};

type BugUUID = Readonly<string>;
const bugUuid: BugUUID = "uuid";
type BugUUIDContainer = {
  id: BugUUID;
  optionalId?: BugUUID;
  ids: BugUUID[];
  getId: () => BugUUID;
  formatId: (id?: BugUUID) => BugUUID;
};

type BugItem = { nested: { value: string } };
type BugCallback = (item: BugItem) => BugItem;
type BugNestedSettings = { items: BugItem[]; callback: BugCallback; inlineCallback: (item: BugItem) => BugItem };
const bugArray: BugItem[] = [];
const bugCallback: BugCallback = (item) => item;

type BugGeneric<T> = { value: T };
const bugGeneric: BugGeneric<string> = { value: "test" };

function bugFunction(item: BugItem): BugItem {
  return item;
}
