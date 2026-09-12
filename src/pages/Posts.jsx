import React from "react";
import { toast } from "sonner";
import { Newspaper } from "lucide-react";
import { fanvueCall, useConnection } from "@/lib/fanvue-gateway";
import ScopeGate from "@/components/shared/ScopeGate";
import EmptyState from "@/components/shared/EmptyState";
import PostComposer from "@/components/posts/PostComposer";
import PostCard from "@/components/posts/PostCard";
import PostDetailDialog from "@/components/posts/PostDetailDialog";
import CreatorSelector from "@/components/shared/CreatorSelector";

export default function Posts() {
  const { connection, creator, loading: loadingConn } = useConnection();
  const [posts, setPosts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [detail, setDetail] = React.useState(null);

  const load = React.useCallback(async () => {
    if (!connection) return;
    try {
      setLoading(true);
      const res = await fanvueCall("listPostsV1", { query: { size: 30, includeUnpublished: "true" }, creatorProfileId: creator?.id });
      setPosts(res?.data?.data || []);
    } catch (e) {
      if (e?.code !== "MISSING_SCOPE") toast.error(e?.error || "Failed to load posts");
    } finally {
      setLoading(false);
    }
  }, [connection]);

  React.useEffect(() => { load(); }, [load]);

  const handleCreate = async (data) => {
    const confirmIt = data.price ? window.confirm(`Publish this PPV post for ${(data.price / 100).toFixed(2)}?`) : window.confirm("Publish this post?");
    if (!confirmIt) return;
    try {
      setCreating(true);
      await fanvueCall("createPost", { data, confirm: !!data.price, creatorProfileId: creator?.id });
      toast.success("Post published");
      await load();
    } catch (e) {
      toast.error(e?.error || "Failed to create post");
    } finally {
      setCreating(false);
    }
  };

  const handlePin = async (post) => {
    try {
      await fanvueCall(post.isPinned ? "unpinPost" : "pinPost", { params: { uuid: post.uuid }, creatorProfileId: creator?.id });
      toast.success(post.isPinned ? "Unpinned" : "Pinned");
      await load();
    } catch (e) { toast.error(e?.error || "Failed"); }
  };

  const handleRepost = async (post) => {
    if (!window.confirm("Repost this post?")) return;
    try {
      await fanvueCall("repostPost", { params: { uuid: post.uuid }, creatorProfileId: creator?.id });
      toast.success("Reposted");
      await load();
    } catch (e) { toast.error(e?.error || "Failed"); }
  };

  const handleDelete = async (post) => {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    try {
      await fanvueCall("deletePost", { params: { uuid: post.uuid }, confirm: true, creatorProfileId: creator?.id });
      setPosts((prev) => prev.filter((p) => p.uuid !== post.uuid));
      toast.success("Post deleted");
    } catch (e) { toast.error(e?.error || "Failed"); }
  };

  if (loadingConn) return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" /></div>;
  if (!connection) return <div className="h-full p-8"><EmptyState icon={Newspaper} title="Connect Fanvue" description="Connect a Fanvue creator account to manage posts." actionLabel="Go to Models" actionTo="/models" /></div>;
  if (!(connection.granted_scopes || []).includes("read:post")) return <div className="h-full p-8"><ScopeGate missing={["read:post", "write:post"]} /></div>;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h1 className="font-heading text-3xl text-foreground">Posts</h1>
          <CreatorSelector />
        </div>
        <p className="mb-6 text-sm text-muted-foreground">Publish, pin, repost and engage with comments, likes and tips</p>

        <div className="mb-8">
          <PostComposer onCreate={handleCreate} creating={creating} />
        </div>

        <h2 className="mb-3 text-sm font-medium text-foreground">Feed</h2>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />)}</div>
        ) : posts.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No posts yet.</div>
        ) : (
          <div className="space-y-2">
            {posts.map((p) => (
              <PostCard key={p.uuid} post={p} onView={setDetail} onPin={handlePin} onRepost={handleRepost} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      {detail && <PostDetailDialog post={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}