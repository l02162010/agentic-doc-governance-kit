export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
    this.exitCode = 2;
  }
}

function flagSpec(schema, name) {
  return schema.flags?.[name] ?? null;
}

export function parseArgs(argv, schema = {}) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    let token = argv[index];
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (token.startsWith("-") && !token.startsWith("--")) {
      const alias = schema.aliases?.[token.slice(1)];
      if (!alias) throw new UsageError(`Unknown option ${token}.`);
      token = `--${alias}`;
    }
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const [rawName, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    const spec = flagSpec(schema, rawName);
    if (!spec) throw new UsageError(`Unknown option --${rawName}.`);

    if (spec.type === "boolean") {
      if (inlineValue !== undefined && !["true", "false"].includes(inlineValue)) {
        throw new UsageError(`Option --${rawName} does not take a value.`);
      }
      flags[rawName] = inlineValue === undefined ? true : inlineValue === "true";
      continue;
    }

    if (spec.type !== "string") throw new UsageError(`Invalid parser schema for --${rawName}.`);

    const value = inlineValue ?? argv[index + 1];
    if (!value || value.startsWith("--")) throw new UsageError(`Missing value for --${rawName}.`);
    flags[rawName] = value;
    if (inlineValue === undefined) index += 1;
  }

  return { flags, positionals };
}

export function requireNoPositionals(positionals, context) {
  if (positionals.length > 0) {
    throw new UsageError(`${context} does not accept positional arguments: ${positionals.join(" ")}`);
  }
}
