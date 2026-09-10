import React from "react";
import { Pin, PinOff, Repeat2, MessageSquare, Trash2, Heart, DollarSign } from "lucide-react";
import { money, fmtDateShort } from "@/lib/fanvue-gateway";

export default function PostCard({ post, onView, onPin, onRepost, onDelete }) {
  return (
    <div className={`rounded-lg border bg-card p-4 ${post.isPinned ? "border-primary/40 ring-1 ring-primary/20" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {post.isPinned && <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"><Pin className="h-3 w-3" />Pinned</span>}
            {post.price ? <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success"><DollarSign className="h-3 w-3" />{money(post.price)}</span> : null}
            <span className="text-xs text-muted-foreground">{post.audience?.replace("-", " ")}</span>
            <span className="text-xs text-muted-foreground">{fmtDateShort(post.publishedAt || post.publishAt || post.createdAt)}</span>
          </div>
          <p className="line-clamp-3 cursor-pointer text-sm text-foreground hover:text-primary" onClick={() => onView(post)}>
            {post.text || "[media only]"}
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" />{post.likesCount ?? 0}</span>
            <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{post.commentsCount ?? 0}</span>
            <span className="inline-flex items-center gap-1"><DollarSign className="h-3 w-3" />{post.tips?.count ?? 0} tips · {money(post.tips?.totalGross)}</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button onClick={() => onPin(post)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-primary" title={post.isPinned ? "Unpin" : "Pin"}>
            {post.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
          <button onClick={() => onRepost(post)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-primary" title="Repost">
            <Repeat2 className="h-4 w-4" />
          </button>
          <button onClick={() => onView(post)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title="Comments & likes">
            <MessageSquare className="h-4 w-4" />
          </button>
          <button onClick={() => onDelete(post)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive" title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}