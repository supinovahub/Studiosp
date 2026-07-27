import { normalizePhone } from '@/lib/whatsapp/phone-utils';

type ExistingContact = {
  name?: string | null;
  email?: string | null;
};

type ImportedLead = {
  name?: unknown;
  email?: unknown;
  phone_e164?: unknown;
};

export function contactUpdatesFromImportedLead(
  contact: ExistingContact,
  lead: ImportedLead
) {
  const updates: { name?: string; email?: string } = {};
  const importedName = String(lead.name ?? '').trim();
  const currentName = String(contact.name ?? '').trim();
  const phone = normalizePhone(String(lead.phone_e164 ?? ''));

  if (importedName && (!currentName || normalizePhone(currentName) === phone)) {
    updates.name = importedName;
  }

  const importedEmail = String(lead.email ?? '').trim();
  if (importedEmail && !String(contact.email ?? '').trim()) {
    updates.email = importedEmail;
  }

  return updates;
}
