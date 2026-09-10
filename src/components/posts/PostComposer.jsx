import React from "react";
import { Loader2, Send } from "lucide-react";

const AUDIENCES = [
  { id: "subscribers", label: "Subscribers only" },
  { id: "followers-and-subscribers", label: "Followers + Subscribers" },
];

export default function PostComposer({ onCreate, creating }) {
  const [text, setText] = React.useState("");
  const [priceCents, setPriceCents] = React.useState(0);
  const [audience, setAudience] = React.useState("subscribers");
  const [publishAt, setPublishAt] = React.useState("");

  const valid = text.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    onCreate({
      text: text.trim(),
      price: priceCents > 0 ? priceCents : null,
      audience,
      publishAt: publishAt ? new Date(publishAt).toISOString() : null,
    });
    setText("");
    setPriceCents(0);
    setPublishAt("");
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">New Post</h3>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a post…"
        rows={4}
        className="mb-3 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          PPV (cents)
          <input
            type="number"
            min={0}
            step={100}
            value={priceCents}
            onChange={(e) => setPriceCents(Math.max(0, Number(e.target.value)))}
            className="w-28 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
        >
          {AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Schedule
          <input
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
      </div>
      <button
        onClick={submit}
        disabled={!valid || creating}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
      >
        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {publishAt ? "Schedule post" : "Publish post"}
      </button>
    </div>
  );
}