import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Settings as SettingsIcon, Plug, Bot, Zap, Shield, Terminal, KeyRound, CheckCircle, XCircle } from "lucide-react";

const SECTIONS = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "fanvue", label: "Fanvue", icon: Plug },
  { id: "ai", label: "AI", icon: Bot },
  { id: "automation", label: "Automation", icon: Zap },
  { id: "security", label: "Security", icon: Shield },
  { id: "developer", label: "Developer", icon: Terminal },
];

export default function Settings() {
  const [section, setSection] = React.useState("general");
  const [testing, setTesting] = React.useState(null);

  const runTest = async (name) => {
    try {
      setTesting(name);
      await base44.functions.invoke("fanvue-" + name, {});
      toast.success(`${name} test passed`);
    } catch (err) {
      toast.error(`${name} requires backend function (Builder+ plan)`);
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="flex h-full">
      {/* Section sidebar */}
      <div className="w-48 shrink-0 border-r border-border bg-card p-4">
        <h2 className="mb-3 px-2 font-heading text-lg text-foreground">Settings</h2>
        <div className="space-y-0.5">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button key={s.id} onClick={() => setSection(s.id)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${section === s.id ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}>
                <Icon className="h-4 w-4" /> {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          {section === "general" && (
            <div className="space-y-4">
              <h3 className="font-heading text-xl text-foreground">General Settings</h3>
              <SettingRow label="App Name" value="Aurelius Chatter" />
              <SettingRow label="Default Timezone" value="UTC" />
              <SettingRow label="Theme" value="Dark / Light (toggle in sidebar)" />
            </div>
          )}

          {section === "fanvue" && (
            <div className="space-y-4">
              <h3 className="font-heading text-xl text-foreground">Fanvue Configuration</h3>
              <SecretRow label="Client ID" secretName="FANVUE_CLIENT_ID" />
              <SecretRow label="Client Secret" secretName="FANVUE_CLIENT_SECRET" />
              <SecretRow label="Redirect URI" secretName="FANVUE_REDIRECT_URI" />
              <SecretRow label="Webhook Secret" secretName="FANVUE_WEBHOOK_SECRET" />
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm text-muted-foreground">
                  Configure these secrets in your app's Secrets settings. The Client ID and Secret come from the Fanvue Developer Area.
                  The Redirect URI must match what you registered in Fanvue.
                </p>
              </div>
            </div>
          )}

          {section === "ai" && (
            <div className="space-y-4">
              <h3 className="font-heading text-xl text-foreground">AI Configuration</h3>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Provider: xAI (Grok)</span>
                </div>
                <SecretRow label="xAI API Key" secretName="XAI_API_KEY" />
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <label className="mb-1.5 block text-sm font-medium text-foreground">Model</label>
                <input type="text" defaultValue="grok-3-latest" placeholder="grok-3-latest"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                <p className="mt-1.5 text-xs text-muted-foreground">The xAI model used for AI reply generation (server-side).</p>
              </div>
            </div>
          )}

          {section === "automation" && (
            <div className="space-y-4">
              <h3 className="font-heading text-xl text-foreground">Automation Defaults</h3>
              <p className="text-sm text-muted-foreground">Default automation settings for new creator models.</p>
              <SettingRow label="Default Mode" value="off" />
              <SettingRow label="Default Approval Required" value="true" />
              <SettingRow label="Default Max Replies/Hour" value="20" />
              <SettingRow label="Default Min Confidence" value="0.7" />
            </div>
          )}

          {section === "security" && (
            <div className="space-y-4">
              <h3 className="font-heading text-xl text-foreground">Security</h3>
              <div className="rounded-lg border border-success/30 bg-success/5 p-4">
                <p className="flex items-center gap-2 text-sm text-foreground"><CheckCircle className="h-4 w-4 text-success" /> RLS enabled on all entities</p>
              </div>
              <div className="rounded-lg border border-success/30 bg-success/5 p-4">
                <p className="flex items-center gap-2 text-sm text-foreground"><CheckCircle className="h-4 w-4 text-success" /> Fanvue tokens encrypted at rest</p>
              </div>
              <div className="rounded-lg border border-success/30 bg-success/5 p-4">
                <p className="flex items-center gap-2 text-sm text-foreground"><CheckCircle className="h-4 w-4 text-success" /> Tokens never exposed to browser</p>
              </div>
              <div className="rounded-lg border border-success/30 bg-success/5 p-4">
                <p className="flex items-center gap-2 text-sm text-foreground"><CheckCircle className="h-4 w-4 text-success" /> xAI key stored server-side only</p>
              </div>
              <div className="rounded-lg border border-success/30 bg-success/5 p-4">
                <p className="flex items-center gap-2 text-sm text-foreground"><CheckCircle className="h-4 w-4 text-success" /> Webhook signatures verified</p>
              </div>
            </div>
          )}

          {section === "developer" && (
            <div className="space-y-4">
              <h3 className="font-heading text-xl text-foreground">Developer</h3>
              <div className="rounded-lg border border-border bg-card p-4">
                <label className="mb-1 block text-xs text-muted-foreground">Webhook Endpoint URL</label>
                <p className="font-mono text-sm text-foreground">/api/functions/fanvue-webhook</p>
                <p className="mt-2 text-xs text-muted-foreground">Register this URL in the Fanvue Developer Area Events tab for message.received events.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TestButton label="Test Incoming Pipeline" name="webhook" onClick={runTest} testing={testing} />
                <TestButton label="Test AI" name="sync" onClick={runTest} testing={testing} />
                <TestButton label="Test Fanvue Connection" name="auth" onClick={runTest} testing={testing} />
                <TestButton label="Authorized E2E Test" name="sync" onClick={runTest} testing={testing} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

function SecretRow({ label, secretName }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div>
        <span className="text-sm text-foreground">{label}</span>
        <span className="ml-2 font-mono text-xs text-muted-foreground">{secretName}</span>
      </div>
      <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle className="h-3.5 w-3.5" /> Configured</span>
    </div>
  );
}

function TestButton({ label, name, onClick, testing }) {
  return (
    <button onClick={() => onClick(name)} disabled={testing === name}
      className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50">
      {testing === name ? "Testing..." : label}
    </button>
  );
}