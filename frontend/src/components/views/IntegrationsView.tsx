"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { TextInput } from "@/components/ui/Field";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useChannels, useConsole } from "@/hooks/useSentinel";
import { PUBLIC_MODE } from "@/lib/chains";
import { ReadOnlyDemo } from "@/components/ui/ReadOnlyDemo";
import type { Channel } from "@/lib/types";

export function IntegrationsView() {
  usePageTitle("Alerts & integrations");
  const { data: channels = [] } = useChannels();
  const consoleApi = useConsole();
  const [sent, setSent] = useState<string | null>(null);

  function save(next: Channel[]) {
    consoleApi.saveChannels(next);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {channels.map((channel) => (
          <Card key={channel.id}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-medium">{channel.label}</h2>
              <StatusPill tone={channel.connected ? "safe" : "muted"} label={channel.connected ? "Connected" : "Not connected"} />
            </div>
            <label className="mt-4 block text-sm">
              Destination
              <TextInput
                className="mt-2"
                value={channel.target}
                placeholder={channel.id === "email" ? "security@protocol.example" : "Webhook or handle"}
                readOnly={PUBLIC_MODE}
                onChange={(event) =>
                  save(channels.map((item) => (item.id === channel.id ? { ...item, target: event.target.value, connected: Boolean(event.target.value) } : item)))
                }
              />
            </label>
            {PUBLIC_MODE ? <ReadOnlyDemo className="mt-3" /> : (
            <Button
              variant="secondary"
              className="mt-3"
              disabled={!channel.connected}
              onClick={() => {
                setSent(channel.id);
                window.setTimeout(() => setSent((current) => (current === channel.id ? null : current)), 2500);
              }}
            >
              {sent === channel.id ? (
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-safe" aria-hidden /> Test sent
                </span>
              ) : (
                "Send test"
              )}
            </Button>
            )}
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="font-display text-lg font-medium">Routing rules</h2>
        <p className="mt-2 text-sm text-textMuted">Alert routes are stored by the backend with these channels.</p>
      </Card>
    </div>
  );
}
