# API contract

## `GET /api/dream?page=1&limit=20`

Returns newest-first journal entries:

```json
{
  "entries": [
    {
      "id": "dream_003",
      "title": "The light left on",
      "content": "...",
      "visibility": "public",
      "hidden": false,
      "created_at": "2026-09-26T16:42:00.000Z"
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 20
}
```

For a hidden entry, `content` is always `null`. Private reasons and internal context are never returned by this endpoint.

## `PUT /api/dream/:id/title`

```json
{ "title": "A different title" }
```

The included server binds to `127.0.0.1` and is intended for local learning. Add real user authentication and authorization before exposing an adapted service to the internet.

