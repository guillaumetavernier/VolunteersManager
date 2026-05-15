type Args = Record<string, string | number>;
const dict: Record<string, string> = {};

export function t(key: string, args?: Args): string {
  const raw = dict[key] ?? key;
  if (!args) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name) => String(args[name] ?? `{${name}}`));
}
