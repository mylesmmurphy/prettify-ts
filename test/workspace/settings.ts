const _filterSymbol = Symbol("filter");

class FilteringBase {
  inheritedPublic = "";
  _inheritedUnderscore = "";
  private inheritedPrivate = "";
  protected inheritedProtected = "";

  get inheritedAccessor() {
    return "";
  }

  private get inheritedPrivateAccessor() {
    return "";
  }

  protected get inheritedProtectedAccessor() {
    return "";
  }
}

class FilteringExample extends FilteringBase {
  publicField = "";
  _publicField = "";
  "_quotedField" = "";
  private privateField = "";
  protected protectedField = "";
  private _privateUnderscore = "";
  #privateField = "";
  [_filterSymbol] = "";

  constructor(
    public parameterPublic: string,
    public _parameterUnderscore: string,
    private parameterPrivate: string,
    protected parameterProtected: string,
  ) {
    super();
  }

  publicMethod() {
    return this.#privateField;
  }

  _publicMethod() {
    return "";
  }

  private privateMethod() {
    return "";
  }

  protected protectedMethod() {
    return "";
  }

  get publicAccessor() {
    return "";
  }

  get _publicAccessor() {
    return "";
  }

  private get privateAccessor() {
    return "";
  }

  protected get protectedAccessor() {
    return "";
  }

  set publicSetter(value: string) {
    this.publicField = value;
  }

  private set privateSetter(value: string) {
    this.privateField = value;
  }

  protected set protectedSetter(value: string) {
    this.protectedField = value;
  }
}

export declare const filteringExample: FilteringExample;

export type FilteringObject = {
  publicField: string;
  _underscore: string;
  _quoted: number;
  [_filterSymbol]: boolean;
};
