import { idContactKind } from "../text/normalise.js";

/** A specific, user-fixable problem with the input (shown to the caller as-is, never logged). */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

const KIND_TEXT = { email: "an email address", phone: "a phone number", link: "a web or chat link", handle: "a handle" } as const;

/** Reject identifiers that would leak contact details into outputs (the value itself is never repeated). */
export function assertSafeId(id: string, path: string): void {
  const kind = idContactKind(id);
  if (kind) throw new InputError(`${path} looks like ${KIND_TEXT[kind]}; use a name or the platform's ID instead (contact details are never used as IDs)`);
}
