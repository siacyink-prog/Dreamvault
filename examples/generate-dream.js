// This example shows the boundary between product code and model-specific code.
// The caller supplies context, model, storage, and notification adapters.

export async function considerDream({ contextProvider, model, journal, notifier, now = () => new Date() }) {
  const context = await contextProvider.recentActivity();
  const decision = await model.decide({
    instruction: [
      "Decide whether the recent activity contains something worth keeping as a private journal page.",
      "Silence is valid. Do not merely summarize the activity.",
      "Return JSON: { decision, title, content, visibility }.",
    ].join("\n"),
    context,
  });

  if (decision?.decision !== "write" || !String(decision.content || "").trim()) {
    return { wrote: false, reason: "model_skipped" };
  }

  const entry = await journal.create({
    title: String(decision.title || "Untitled").trim(),
    content: String(decision.content).trim(),
    visibility: decision.visibility === "sealed" ? "sealed" : "public",
    created_at: now().toISOString(),
  });
  await notifier?.published?.(entry);
  return { wrote: true, entry };
}


