// Only the fields a question needs leave the platform, and names of people, customers and sites
// are replaced with tokens first (DM-06).

export interface MaskTerms { people: string[]; sites: string[]; customers: string[] }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Names written the way technicians sign work orders: "- J. Patel", "Reported by Sam Okoye".
const SIGNED = /(\b(?:by|from|per|tech(?:nician)?:?)\s+|\s[-–]\s)((?:[A-Z]\.\s?[A-Z][a-z'’-]+)|(?:[A-Z][a-z'’-]+\s[A-Z][a-z'’-]+))/g;

export function mask(text: string, terms: MaskTerms): string {
  let out = text;
  const replaceAll = (list: string[], token: string) => {
    for (const t of [...list].filter((x) => x.trim().length > 2).sort((a, b) => b.length - a.length)) {
      out = out.replace(new RegExp(`\\b${escape(t)}\\b`, 'gi'), token);
    }
  };
  replaceAll(terms.customers, '[customer]');
  replaceAll(terms.sites, '[site]');
  replaceAll(terms.people, '[person]');
  out = out.replace(SIGNED, (_m, pre: string) => `${pre}[person]`);
  return out;
}

/** Normalised text used to deduplicate inputs (DM-05). */
export const normaliseText = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:!]+$/, '').trim();
