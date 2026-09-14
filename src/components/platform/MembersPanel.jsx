import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Trash2, Lock, UserPlus, Loader2, X } from "lucide-react";

// MembersPanel — shown inside an expanded customer row on the Platform Dashboard.
// Lists each org member (email + role badge), lets the platform admin add an
// operator via a small dialog, and remove non-owner members.
export default function MembersPanel({ customer, onMembersChanged }) {
  const [showAdd, setShowAdd] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [removingId, setRemovingId] = React.useState(null);

  const members = customer?.members || [];

  const handleAdd = async () => {
    const e = email.trim();
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      toast.error("Enter a valid email address");
      return;
    }
    try {
      setAdding(true);
      const res = await base44.functions.invoke("platform-invite-member", {
        email: e.toLowerCase(),
        organizationId: customer.id,
      });
      if (res?.alreadyMember) {
        toast.info(`${e} is already a member of this organization`);
      } else {
        toast.success(`Invite sent to ${e}`);
      }
      setShowAdd(false);
      setEmail("");
      onMembersChanged?.();
    } catch (err) {
      toast.error("Failed to invite: " + (err.message || "Unknown error"));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (member) => {
    if (member.role === "owner") return;
    if (!window.confirm(`Remove ${member.email || "this member"} from ${customer.name}?`)) return;
    try {
      setRemovingId(member.id);
      await base44.functions.invoke("platform-remove-member", { memberId: member.id });
      toast.success("Member removed");
      onMembersChanged?.();
    } catch (err) {
      toast.error("Failed to remove: " + (err.message || "Unknown error"));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="col-span-3 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Members</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {members.length} {members.length === 1 ? "person" : "people"} · operators work this org's inbox
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add Operator
        </button>
      </div>

      {members.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">No members recorded for this organization.</p>
      ) : (
        <div className="divide-y divide-border">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2.5">
                <RoleBadge role={m.role} platformAdmin={m.platformAdmin} />
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{m.email || m.fullName || m.userId}</p>
                  {m.fullName && m.email && (
                    <p className="truncate text-[11px] text-muted-foreground">{m.fullName}</p>
                  )}
                </div>
              </div>
              {m.role === "owner" ? (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Owner — cannot be removed" />
              ) : (
                <button
                  onClick={() => handleRemove(m)}
                  disabled={removingId === m.id}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  title="Remove member"
                >
                  {removingId === m.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddOperatorDialog
          email={email}
          setEmail={setEmail}
          adding={adding}
          onAdd={handleAdd}
          onClose={() => { setShowAdd(false); setEmail(""); }}
        />
      )}
    </div>
  );
}

function RoleBadge({ role, platformAdmin }) {
  const STYLES = {
    owner: "bg-primary/15 text-primary",
    admin: "bg-accent text-accent-foreground",
    operator: "bg-muted text-muted-foreground",
  };
  const LABEL = platformAdmin ? "platform admin" : role;
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", STYLES[role] || STYLES.operator)}>
      {LABEL}
    </span>
  );
}

function AddOperatorDialog({ email, setEmail, adding, onAdd, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-heading text-lg text-foreground">Add Operator</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          They'll receive an email invite to join Aurelius and be linked to this organization as an operator.
        </p>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Email address</label>
        <input
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
          placeholder="teammate@example.com"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={onAdd}
            disabled={adding || !email.trim()}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Send invite
          </button>
        </div>
      </div>
    </div>
  );
}