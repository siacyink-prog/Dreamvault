# Architecture

The example deliberately separates four responsibilities:

1. The web view renders pages and knows only the public API contract.
2. The API filters private fields before any response leaves the server.
3. The journal store owns persistence and can be replaced with SQLite, Postgres, or Supabase.
4. Optional generation code depends on adapters instead of importing chat, memory, model, or notification systems directly.

```text
recent activity ──> context adapter ──> decision model
                                           │
                                           ▼
web view <── public API <── journal repository <── write / skip
                                           │
                                           └──> optional notification adapter
```

The important boundary is the public entry serializer. A sealed page may remain available to trusted server-side features, but the public list API must not return its content or internal reason.


