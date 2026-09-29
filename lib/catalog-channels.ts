export type CatalogChannel = "whatsapp" | "telegram" | "instagram";

export type CatalogChannels = Record<CatalogChannel, string>;

export const CATALOG_CHANNELS: CatalogChannel[] = ["whatsapp", "telegram", "instagram"];

export const EMPTY_CHANNELS: CatalogChannels = { whatsapp: "", telegram: "", instagram: "" };

const PHONE_PATTERN = /^\+?\d{6,15}$/;
const HANDLE_PATTERN = /^[A-Za-z0-9._]{2,64}$/;

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function channelsFromShop(data: Record<string, unknown> | undefined): CatalogChannels {
  const channels: CatalogChannels = {
    whatsapp: readText(data?.catalogWhatsapp),
    telegram: readText(data?.catalogTelegram),
    instagram: readText(data?.catalogInstagram),
  };
  const legacy = readText(data?.catalogContact);
  if (legacy && CATALOG_CHANNELS.every((channel) => !channels[channel])) {
    if (PHONE_PATTERN.test(legacy.replace(/[\s()-]/g, ""))) channels.whatsapp = legacy;
    else channels.instagram = legacy;
  }
  return channels;
}

function channelId(channel: CatalogChannel, value: string) {
  const trimmed = value.trim();
  if (channel === "whatsapp") return trimmed.replace(/\D/g, "");
  return trimmed
    .replace(/^https?:\/\/(www\.)?(t\.me|telegram\.me|instagram\.com|ig\.me\/m)\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
}

export function isValidChannel(channel: CatalogChannel, value: string) {
  const id = channelId(channel, value);
  return channel === "whatsapp" ? id.length >= 6 && id.length <= 15 : HANDLE_PATTERN.test(id);
}

export function hasAnyChannel(channels: CatalogChannels) {
  return CATALOG_CHANNELS.some((channel) => isValidChannel(channel, channels[channel]));
}

export function channelUrl(channel: CatalogChannel, value: string, message = "") {
  if (!isValidChannel(channel, value)) return "";
  const id = channelId(channel, value);
  if (channel === "whatsapp") return `https://wa.me/${id}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
  return channel === "telegram" ? `https://t.me/${id}` : `https://ig.me/m/${id}`;
}

export function formatCatalogPrice(value: number, intlLocale: string) {
  return `${value.toLocaleString(intlLocale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

export interface OrderLine {
  name: string;
  variant: string;
  quantity: number;
  unitPrice?: number;
}

export function buildOrderMessage(
  lines: OrderLine[],
  link: string,
  intlLocale: string,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  const rows = lines.map((line) => {
    const label = line.variant ? `${line.name} — ${line.variant}` : line.name;
    const price = line.unitPrice !== undefined ? ` = ${formatCatalogPrice(line.unitPrice * line.quantity, intlLocale)}` : "";
    return `• ${label} × ${line.quantity}${price}`;
  });
  const priced = lines.every((line) => line.unitPrice !== undefined);
  const total = lines.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.quantity, 0);
  return [
    t("catalog.orderGreeting"),
    ...rows,
    ...(priced && lines.length > 1 ? [t("catalog.orderTotal", { total: formatCatalogPrice(total, intlLocale) })] : []),
    link,
  ].join("\n");
}
