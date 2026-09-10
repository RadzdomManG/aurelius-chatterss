import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { FlaskConical, Send, AlertCircle, Sparkles } from "lucide-react";
import { generatePlaygroundReply } from "@/lib/ai-service";

export default function Playground() {
  const [creators, setCreators] = React.useState([]);
  const [personas, setPersonas] = React.useState({});
  const [selectedCreator, setSelectedCreator] = React.useState("");
  const [fanName, setFanName] = React.useState("");
  const [fanMemory, setFanMemory] = React.useState("");
  const [context, setContext] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [result, setResult] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    loadCreators();
  }, []);

  const loadCreators = async () => {
    try {
      const list = await base44.entities.CreatorProfile.list("-created_date", 50);
      setCreators(list);
      const personaMap = {};
      for (const c of list) {
        const ps = await base44.entities.PersonaProfile.filter({ creator_profile_id: c.id, active: true }, "-created_date", 1);
        if (ps[0]) personaMap[c.id] = ps[0];
      }
      setPersonas(personaMap);
    } catch (err) { /* ignore */ }
  };

  const handleGenerate = async () => {
    if (!message.trim() || !selectedCreator) return;
    try {
      setLoading(true);
      setResult(null);

      const persona = personas[selectedCreator];
      const recentMessages = context.trim()
        ? context.split("\n").map((line) => {
            const [sender, ...rest] = line.split(":");
            return { sender: sender.trim().toLowerCase().includes("fan") ? "fan" : "creator", text: rest.join(":").trim() };
          }).filter((m) => m.text)
        : [];

      const res = await generatePlaygroundReply({
        personaInstructions: persona?.instructions,
        fanDisplayName: fanName,
        fanMemory,
        recentMessages,
        newMessage: message,
      });

      setResult(res);
      if (res.error) toast.error(res.error);
      else toast.success("Simulation generated");
    } catch (err) {
      toast.error("Failed to generate simulation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6">
          <h1 className="mb-1 flex items-center gap-2 font-heading text-3xl text-foreground">
            <FlaskConical className="h-7 w-7 text-primary" /> Playground
          </h1>
          <p className="text-sm text-muted-foreground">Simulate AI replies using saved personas. Results are never sent to Fanvue.</p>
        </div>

        {/* Simulation warning */}
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-warning" />
          <span className="text-sm text-warning">Simulation only — results are NOT sent to Fanvue.</span>
        </div>

        <div className="space-y-4">
          {/* Creator selector */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Creator</label>
            <select value={selectedCreator} onChange={(e) => setSelectedCreator(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">Select a creator...</option>
              {creators.map((c) => (
                <option key={c.id} value={c.id}>{c.display_name}</option>
              ))}
            </select>
            {selectedCreator && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {personas[selectedCreator] ? `Persona: ${personas[selectedCreator].display_name}` : "No active persona set for this creator"}
              </p>
            )}
          </div>

          {/* Fan context */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Fan Name (optional)</label>
              <input type="text" value={fanName} onChange={(e) => setFanName(e.target.value)} placeholder="e.g. James"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Fan Memory (optional)</label>
              <input type="text" value={fanMemory} onChange={(e) => setFanMemory(e.target.value)} placeholder="e.g. location: LA, likes: beach photos"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Context */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Conversation Context (optional)</label>
            <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={4} placeholder={"Fan: Hey! How are you?\nCreator: I'm great! Thanks for asking 😊\nFan: That's awesome"}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>

          {/* New message */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Fan's New Message</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Type the fan's message here..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>

          <button onClick={handleGenerate} disabled={loading || !message.trim() || !selectedCreator}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Sparkles className="h-4 w-4" /> {loading ? "Generating..." : "Generate Simulation"}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-medium text-foreground"><Sparkles className="h-4 w-4 text-primary" /> AI Response</h3>
              <span className="text-xs text-muted-foreground">Simulation — not sent</span>
            </div>
            {result.reply ? (
              <p className="text-foreground">{result.reply}</p>
            ) : (
              <p className="text-destructive">{result.error || "No response generated"}</p>
            )}
            {result.confidence && (
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <span>Confidence: {Math.round((result.confidence || 0) * 100)}%</span>
                <span>Intent: {result.intent}</span>
                <span>Sentiment: {result.sentiment}</span>
              </div>
            )}
            {result.memoryUpdates?.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-1 text-xs text-muted-foreground">Memory Updates:</p>
                {result.memoryUpdates.map((m, i) => (
                  <p key={i} className="text-xs text-foreground">{m.key}: {m.value}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}