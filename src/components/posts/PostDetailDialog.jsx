import React from "react";
import { X, Heart, MessageSquare, DollarSign, Send } from "lucide-react";
import { fanvueCall, money, fmtDateShort } from "@/lib/fanvue-gateway";

export default function PostDetailDialog({ post, onClose }) {
  const [tab, setTab] = React.useState("comments");
  const [comments, setComments] = React.useState([]);
  const [likes, setLikes] = React.useState([]);
  const [tips, setTips] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [commentText, setCommentText] = React.useState("");
  const [posting, setPosting] = React.useState(false);

  React.useEffect(() => {
    if (!post) return;
    (async () => {
      try {
        setLoading(true);
        const [c, l, t] = await Promise.all([
          fanvueCall("getPostComments_v1_experimental", { params: { uuid: post.uuid }, query: { size: 50 } }),
          fanvueCall("getPostLikes_v1_experimental", { params: { uuid: post.uuid }, query: { size: 50 } }),
          fanvueCall("getPostTips_v1_experimental", { params: { uuid: post.uuid }, query: { size: 50 } }),
        ]);
        setComments(c?.data?.data || []);
        setLikes(l?.data?.data || []);
        setTips(t?.data?.data || []);
      } catch (e) {
      } finally {
        setLoading(false);
      }
    })();
  }, [post]);

  const addComment = async () => {
    if (!commentText.trim()) return;
    try {
      setPosting(true);
      await fanvueCall("createPostComment", { params: { uuid: post.uuid }, data: { text: commentText.trim() } });
      setCommentText("");
      const c = await fanvueCall("getPostComments_v1_experimental", { params: { uuid: post.uuid }, query: { size: 50 } });
      setComments(c?.data?.data || []);
    } catch (e) {
    } finally {
      setPosting(false);
    }
  };

  if (!post) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto scrollbar-thin rounded-lg border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="font-heading text-lg text-foreground">Post details</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-4 whitespace-pre-wrap text-sm text-foreground">{post.text || "[media only]"}</p>

        <div className="mb-3 flex gap-1 rounded-md border border-border p-1">
          {[
            { id: "comments", label: `Comments (${comments.length})`, icon: MessageSquare },
            { id: "likes", label: `Likes (${likes.length})`, icon: Heart },
            { id: "tips", label: `Tips (${tips.length})`, icon: DollarSign },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : tab === "comments" ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addComment()}
                placeholder="Add a comment…"
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button onClick={addComment} disabled={posting || !commentText.trim()} className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50">
                <Send className="h-4 w-4" />
              </button>
            </div>
            {comments.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No comments yet.</p>
            ) : (
              comments.map((c) => (
                <div key={c.uuid} className="rounded-md bg-muted/50 p-2.5">
                  <div className="mb-0.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{c.user?.displayName || c.user?.handle}</span>
                    <span className="text-muted-foreground">{fmtDateShort(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-foreground">{c.text}</p>
                </div>
              ))
            )}
          </div>
        ) : tab === "likes" ? (
          likes.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No likes yet.</p>
          ) : (
            <div className="space-y-1.5">
              {likes.map((l, i) => (
                <div key={l.user?.uuid || i} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{l.user?.displayName || l.user?.handle}</span>
                  <span className="text-xs text-muted-foreground">{fmtDateShort(l.createdAt)}</span>
                </div>
              ))}
            </div>
          )
        ) : tips.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No tips yet.</p>
        ) : (
          <div className="space-y-1.5">
            {tips.map((t, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{t.user?.displayName || t.user?.handle}</span>
                <span className="font-medium text-success">{money(t.gross)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}