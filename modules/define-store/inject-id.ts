const STORE = /^(export\s+const\s+\$(\w+)\s*=\s*defineStore\()(?!\s*["'`])/gm;

export function injectStoreId(code: string): string {
  return code.replace(STORE, '$1"$2", ');
}
