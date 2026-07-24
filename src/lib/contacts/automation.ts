export function isContactAutomationSuppressed(contact: {
  automation_status?: unknown;
}) {
  return contact.automation_status === 'suppressed';
}
