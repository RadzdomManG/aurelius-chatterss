import React from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { ArrowLeft, Save, Bot, Zap, User, Plug, Activity, Settings as SettingsIcon, Eye } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import ModelOverview from "@/components/models/ModelOverview";
import ModelPersona from "@/components/models/ModelPersona";
import ModelAutomation from "@/components/models/ModelAutomation";
import ModelFans from "@/components/models/ModelFans";
import ModelFanvue from "@/components/models/ModelFanvue";
import ModelDiagnostics from "@/components/models/ModelDiagnostics";

const TABS = [
  { id: "overview", label: "Overview", icon: Eye },
  { id: "persona", label: "Persona", icon: Bot },
  { id: "automation", label: "Automation", icon: Zap },
  { id: "fans", label: "Fans", icon: User },
  { id: "fanvue", label: "Fanvue", icon: Plug },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
];

export default function ModelWorkspace() {
  const { creatorProfileId } = useParams();
  const [creator, setCreator] = React.useState(null);
  const [persona, setPersona] = React.useState(null);
  const [autoSettings, setAutoSettings] = React.useState(null);
  const [connection, setConnection] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("overview");

  React.useEffect(() => {
    if (creatorProfileId) loadAll();
  }, [creatorProfileId]);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [c, personas, settings, conns] = await Promise.all([
        base44.entities.CreatorProfile.get(creatorProfileId),
        base44.entities.PersonaProfile.filter({ creator_profile_id: creatorProfileId }, "-created_date", 5),
        base44.entities.AutomationSettings.filter({ creator_profile_id: creatorProfileId }, "-created_date", 1),
        base44.entities.FanvueConnection.filter({ creator_profile_id: creatorProfileId }, "-created_date", 1),
      ]);
      setCreator(c);
      setPersona(personas.find((p) => p.active) || personas[0] || null);
      setAutoSettings(settings[0] || null);
      setConnection(conns[0] || null);
    } catch (err) {
      toast.error("Failed to load model workspace");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Model not found</p>
        <Link to="/models" className="text-primary hover:underline">← Back to Models</Link>
      </div>
    );
  }

  const TabContent = {
    overview: <ModelOverview creator={creator} persona={persona} connection={connection} autoSettings={autoSettings} />,
    persona: <ModelPersona creator={creator} persona={persona} onSaved={loadAll} />,
    automation: <ModelAutomation creator={creator} autoSettings={autoSettings} onSaved={loadAll} />,
    fans: <ModelFans creator={creator} />,
    fanvue: <ModelFanvue creator={creator} connection={connection} onSaved={loadAll} />,
    diagnostics: <ModelDiagnostics creator={creator} connection={connection} />,
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Link to="/models" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-heading text-primary">
            {creator.display_name?.[0]?.toUpperCase()}
          </div>
          <div>
            <h1 className="font-heading text-xl text-foreground">{creator.display_name}</h1>
            <p className="text-sm text-muted-foreground">@{creator.username || "unknown"}</p>
          </div>
          <div className="ml-auto">
            <StatusBadge
              variant={connection?.status === "connected" ? "success" : "neutral"}
              label={connection?.status === "connected" ? "Fanvue Connected" : "No Fanvue"}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border px-6">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
        {TabContent[activeTab]}
      </div>
    </div>
  );
}