"use client";

import { AtSign, LucideIcon, MessageCircle, Send } from "lucide-react";
import { CATALOG_CHANNELS, CatalogChannel, CatalogChannels, channelUrl } from "@/lib/catalog-channels";

const CHANNEL_META: Record<CatalogChannel, { label: string; icon: LucideIcon }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  telegram: { label: "Telegram", icon: Send },
  instagram: { label: "Instagram", icon: AtSign },
};

export function availableChannels(channels: CatalogChannels) {
  return CATALOG_CHANNELS.filter((channel) => channelUrl(channel, channels[channel]) !== "");
}

export default function OrderChannels({ channels, message = "", disabled = false, onCopied, onChannelClick }: {
  channels: CatalogChannels;
  message?: string;
  disabled?: boolean;
  onCopied?: () => void;
  onChannelClick?: (channel: CatalogChannel) => void;
}) {
  return (
    <div className="cat-channels" data-disabled={disabled || undefined}>
      {availableChannels(channels).map((channel) => {
        const { label, icon: Icon } = CHANNEL_META[channel];
        return (
          <a
            key={channel}
            href={channelUrl(channel, channels[channel], message)}
            target="_blank"
            rel="noopener noreferrer"
            className="cat-channel"
            data-channel={channel}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : undefined}
            onClick={(e) => {
              if (disabled) { e.preventDefault(); return; }
              onChannelClick?.(channel);
              if (message && channel !== "whatsapp") navigator.clipboard?.writeText(message).then(onCopied, () => undefined);
            }}
          >
            <Icon size={16} />
            {label}
          </a>
        );
      })}
    </div>
  );
}
