/** A specific, user-fixable problem with the input (shown to the caller as-is, never logged). */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

/** Reject identifiers that would leak contact details into outputs. */
export function assertSafeId(id: string, path: string): void {
  if (/\S@\S+\.\S/.test(id)) throw new InputError(`${path} looks like an email address; use a name or the platform's ID instead (contact details are never used as IDs)`);
  const digits = (id.match(/\d/g) ?? []).length;
  if (digits >= 9 && digits <= 15 && /^[+\d\s().-]+$/.test(id) && /^(\+|0|\()/.test(id.trim())) {
    throw new InputError(`${path} looks like a phone number; use a name or the platform's ID instead`);
  }
}
