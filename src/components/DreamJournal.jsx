import { useEffect, useState } from "react";
import { formatShanghai } from "../lib/time.js";

const PAGE_SIZE = 20;

function formatDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  return formatShanghai(value, "en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  return formatShanghai(value, "zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function preview(value, max = 52) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function titleFor(entry) {
  const firstLine = String(entry.content || "").split(/\n/).map((line) => line.trim()).find(Boolean);
  return entry.title || preview(firstLine, 24) || "Untitled";
}

function Chevron({ open }) {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" className={open ? "chevron open" : "chevron"} aria-hidden="true">
      <path d="M2.5 4.25L6 7.75L9.5 4.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DreamJournal() {
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [status, setStatus] = useState("loading");
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dream?page=1&limit=${PAGE_SIZE}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        setEntries(data.entries || []);
        setTotal(Number(data.total) || 0);
        setStatus("ready");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setStatus("error");
      });
    return () => controller.abort();
  }, []);

  async function loadMore() {
    if (loadingMore || entries.length >= total) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const response = await fetch(`/api/dream?page=${nextPage}&limit=${PAGE_SIZE}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const known = new Set(entries.map((entry) => String(entry.id)));
      setEntries((current) => [...current, ...(data.entries || []).filter((entry) => !known.has(String(entry.id)))]);
      setPage(nextPage);
      setTotal(Number(data.total) || total);
    } finally {
      setLoadingMore(false);
    }
  }

  async function saveTitle(entry) {
    const title = draftTitle.trim();
    setEditingId(null);
    setDraftTitle("");
    if (!title) return;

    const response = await fetch(`/api/dream/${encodeURIComponent(entry.id)}/title`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) return;
    const updated = await response.json();
    setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, title: updated.title } : item));
  }

  if (status === "loading") return <section className="journal-state">opening the journal…</section>;
  if (status === "error") return <section className="journal-state error">The journal could not be opened.</section>;
  if (!entries.length) return <section className="journal-state">No pages yet.</section>;

  return (
    <section className="journal" aria-label="Dream journal entries">
      {entries.map((entry) => {
        const open = openId === entry.id;
        const hidden = entry.visibility === "sealed" || entry.visibility === "hidden";
        const editing = editingId === entry.id;
        const time = formatTime(entry.created_at);

        return (
          <article className={open ? "entry open" : "entry"} key={entry.id}>
            <button className="envelope" onClick={() => setOpenId(open ? null : entry.id)} aria-expanded={open}>
              <span className="seal" aria-hidden="true" />
              <span className="envelope-copy">
                <span className="meta">{formatDate(entry.created_at)}{time ? ` · ${time}` : ""}</span>
                <span className="title-row">
                  {editing ? (
                    <input
                      className="title-input"
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onBlur={() => saveTitle(entry)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveTitle(entry);
                        if (event.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <>
                      <span className="entry-title">{titleFor(entry)}</span>
                      <span
                        className="rename"
                        role="button"
                        tabIndex="0"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingId(entry.id);
                          setDraftTitle(entry.title || "");
                        }}
                      >rename</span>
                    </>
                  )}
                </span>
                {!open && <span className="entry-preview">{hidden ? "locked page" : preview(entry.content)}</span>}
              </span>
              <Chevron open={open} />
            </button>

            <div className={open ? "letter open" : "letter"}>
              <div className="letter-clip">
                {open && (
                  <div className="letter-paper">
                    <div className="writer">Dream</div>
                    {hidden
                      ? <p className="locked">This page is still sealed.</p>
                      : <p className="body-copy">{entry.content}</p>}
                  </div>
                )}
              </div>
            </div>
          </article>
        );
      })}

      {entries.length < total && (
        <div className="more-row">
          <button className="more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "opening earlier pages…" : "earlier dreams"}
          </button>
        </div>
      )}
    </section>
  );
}


