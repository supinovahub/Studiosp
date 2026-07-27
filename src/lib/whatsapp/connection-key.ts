export function whatsappConnectionKey(config: {
  id: string;
  provider: string;
  phone_number_id?: string | null;
  uazapi_instance_id?: string | null;
}) {
  const identity =
    config.provider === 'uazapi'
      ? config.uazapi_instance_id
      : config.phone_number_id;
  return `${config.provider}:${identity?.trim() || config.id}`;
}
