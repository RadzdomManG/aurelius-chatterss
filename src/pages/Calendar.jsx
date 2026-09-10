import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Plug, Send, Clock, CheckCircle } from "lucide-react";
import {
  startOfWeek, addDays, format, isSameDay, addWeeks, startOfDay, endOfDay, isWithinInterval,
} from "date-fns";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";

export default function CalendarPage() {
  const [weekStart, setWeekStart] = React.useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [scheduled, setScheduled] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [calendarConnected, setCalendarConnected] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const list = await base44.entities.ScheduledAction.list("-scheduled_for", 50);
      setScheduled(list.filter((s) => s.status === "pending"));
      // Check Google Calendar connector status (would need backend function)
      setCalendarConnected(false);
    } catch (err) {
      toast.error("Failed to load calendar");
    } finally {
      setLoading(false);
    }
  };

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getActionsForDay = (day) => {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    return scheduled.filter((s) => {
      const d = new Date(s.scheduled_for);
      return isWithinInterval(d, { start: dayStart, end: dayEnd });
    });
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl text-foreground">Calendar</h1>
            <p className="mt-1 text-sm text-muted-foreground">Scheduled posts, mass messages, and Fanvue activities</p>
          </div>
          <div className="flex items-center gap-2">
            {calendarConnected ? (
              <StatusBadge variant="success" label="Google Calendar Connected" />
            ) : (
              <button
                onClick={() => toast.info("Connect Google Calendar from the prompt above")}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
              >
                <Plug className="h-4 w-4" /> Connect Google Calendar
              </button>
            )}
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Schedule
            </button>
          </div>
        </div>

        {/* Week navigation */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekStart(addWeeks(weekStart, -1))} className="rounded-md p-1.5 hover:bg-accent">
              <ChevronLeft className="h-5 w-5 text-muted-foreground" />
            </button>
            <button onClick={() => setWeekStart(addWeeks(weekStart, 1))} className="rounded-md p-1.5 hover:bg-accent">
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="rounded-md px-3 py-1.5 text-sm hover:bg-accent">
              Today
            </button>
          </div>
          <h2 className="font-heading text-lg text-foreground">
            {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
          </h2>
        </div>

        {/* Week grid */}
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => {
            const dayActions = getActionsForDay(day);
            const isToday = isSameDay(day, new Date());
            return (
              <div key={day.toISOString()} className={`min-h-32 rounded-lg border p-2 ${isToday ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                <div className="mb-2 text-center">
                  <p className="text-xs font-medium text-muted-foreground">{format(day, "EEE")}</p>
                  <p className={`text-lg font-heading ${isToday ? "text-primary" : "text-foreground"}`}>{format(day, "d")}</p>
                </div>
                <div className="space-y-1">
                  {dayActions.map((action) => (
                    <div key={action.id} className="rounded-md bg-primary/10 px-2 py-1 text-xs">
                      <p className="font-medium text-primary">{format(new Date(action.scheduled_for), "h:mm a")}</p>
                      <p className="truncate text-muted-foreground">{action.action_type}</p>
                    </div>
                  ))}
                  {dayActions.length === 0 && <p className="text-center text-[10px] text-muted-foreground/40">—</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Upcoming list */}
        <div className="mt-8">
          <h3 className="mb-3 text-sm font-medium text-foreground">Upcoming Scheduled Actions</h3>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}</div>
          ) : scheduled.length === 0 ? (
            <EmptyState icon={Clock} title="No scheduled actions" description="Schedule mass messages, posts, and fan messages from the Automation page." actionLabel="Go to Automation" actionTo="/automation" />
          ) : (
            <div className="space-y-2">
              {scheduled.slice(0, 10).map((action) => (
                <div key={action.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                    <Send className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{action.action_type}</p>
                    <p className="text-xs text-muted-foreground">{new Date(action.scheduled_for).toLocaleString()}</p>
                  </div>
                  <StatusBadge variant="info" label={action.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}