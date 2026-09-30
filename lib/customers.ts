import type { Customer } from "@/lib/types";

/** Customer records are written by shop staff, so the limits here mirror
 * `firestore.rules` rather than the anonymous-visitor shape of `orders.ts`: the
 * rules are the real gate, this is the fast local guard that stops obviously bad
 * input from becoming a write. Every limit is also the i18n-visible contract the
 * form is written against. */

export const MAX_CUSTOMER_NAME = 100;
export const MAX_CUSTOMER_CONTACT = 100;
export const MAX_CUSTOMER_EMAIL = 254;
export const MAX_CUSTOMER_NOTE = 2000;
export const MAX_CUSTOMER_TAGS = 20;
export const MAX_TAG_LENGTH = 30;

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

function clamp(value: string, max: number) {
  return collapse(value).slice(0, max);
}

/** Tags are a filter, not free text: they are matched exactly against each
 * other, so they fold to lower case and drop surrounding punctuation. What is
 * left is what a shop types between the commas. */
export function normalizeTag(raw: string): string {
  return collapse(raw.toLowerCase()).replace(/^[#\s]+|[#\s]+$/g, "").slice(0, MAX_TAG_LENGTH);
}

/** Accepts what the tag input actually holds — a comma separated string — as
 * well as an array, so the form and the stored shape stay the same value. */
export function parseTags(input: string | string[] | undefined | null): string[] {
  const parts = Array.isArray(input) ? input : (input ?? "").split(",");
  const tags: string[] = [];
  for (const part of parts) {
    const tag = normalizeTag(part);
    // Duplicates are dropped rather than rejected: a shop typing the same tag
    // twice meant one segment, not a mistake worth an error message.
    if (tag && !tags.includes(tag)) tags.push(tag);
    if (tags.length === MAX_CUSTOMER_TAGS) break;
  }
  return tags;
}

export interface CustomerInput {
  name: string;
  contact?: string;
  email?: string;
  note?: string;
  tags?: string | string[];
}

export interface NormalizedCustomer {
  name: string;
  contact: string;
  email: string;
  note: string;
  tags: string[];
}

export function normalizeCustomer(input: CustomerInput): NormalizedCustomer {
  const name = clamp(input.name ?? "", MAX_CUSTOMER_NAME);
  if (!name) throw new Error("CUSTOMER_NAME_REQUIRED");

  const email = clamp(input.email ?? "", MAX_CUSTOMER_EMAIL);
  // A half-typed address is worse than none: the shop would keep mailing a
  // string that bounces, so a malformed one is rejected rather than stored.
  if (email && !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) {
    throw new Error("CUSTOMER_EMAIL_INVALID");
  }

  return {
    name,
    contact: clamp(input.contact ?? "", MAX_CUSTOMER_CONTACT),
    email,
    note: clamp(input.note ?? "", MAX_CUSTOMER_NOTE),
    tags: parseTags(input.tags),
  };
}

/** Contacts are typed by hand from a phone or a chat app, so the same number
 * arrives spelled several ways. Comparing on digits (and the `@` that marks a
 * handle) makes "+381 64 123-4567" and "0641234567"… not equal, but "+381 64
 * 123-4567" and "+381641234567" are — which is the spelling difference that
 * actually happens when someone is forwarded a contact card. */
export function contactKey(contact: string): string {
  return collapse(contact).toLowerCase().replace(/[^\d@a+]/g, "");
}

export function sameContact(a: string, b: string): boolean {
  const left = contactKey(a);
  return left.length > 0 && left === contactKey(b);
}

/** Free-text search over everything a shop might remember someone by. Tags are
 * included so "vip" finds the segment, and the email is matched whole-field
 * rather than by fragment so a search for "a" does not return everyone.
 *
 * Contact matching strips letters out of both sides, so a purely alphabetic
 * query ("ana") reduces to an empty needle — and every string contains the
 * empty string, which would silently match the whole list. An empty contact
 * needle therefore falls through to the other fields instead. */
export function customerMatches(customer: Customer, query: string): boolean {
  const needle = collapse(query).toLowerCase();
  if (!needle) return true;
  if (customer.name.toLowerCase().includes(needle)) return true;
  const contactNeedle = contactKey(needle);
  if (contactNeedle && contactKey(customer.contact).includes(contactNeedle)) return true;
  if (customer.email.toLowerCase() === needle) return true;
  return customer.tags.some((tag) => tag.includes(needle));
}

export type CustomerSort = "name" | "newest" | "spent";

/** Spending sorts descending and the rest by name, so a name tie is broken by
 * contact: two customers can legitimately share a name. */
export function sortCustomers(
  customers: Customer[],
  sort: CustomerSort,
  spentBy: Map<string, number> = new Map()
): Customer[] {
  return [...customers].sort((a, b) => {
    if (sort === "newest") {
      const delta = (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
      if (delta !== 0) return delta;
    } else if (sort === "spent") {
      const delta = (spentBy.get(b.id) ?? 0) - (spentBy.get(a.id) ?? 0);
      if (delta !== 0) return delta;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.contact.localeCompare(b.contact);
  });
}

/** Every tag in the list with how many customers carry it, most used first —
 * the filter row is built from the data rather than from a fixed vocabulary, so
 * a shop never filters by a segment that has nobody in it. */
export function collectTags(customers: Customer[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const customer of customers) {
    for (const tag of customer.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
