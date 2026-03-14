# /build-app

Build a complete local app using OpenServer meta-tools.

## Step 0 — Gather description

If no argument was provided, ask: "Describe the app you want to build (data it tracks, actions it supports, views needed)."

Wait for the user's response before proceeding.

## Step 1 — Analyze

From the description, identify:
- **Data models**: entities with fields (e.g. tasks with title/done, contacts with name/email)
- **Custom tools**: logic beyond CRUD (e.g. send email, fetch URL, calculate total)
- **Views**: UI screens needed (e.g. list view, detail view, dashboard)

## Step 2 — Schemas (one per data model)

Call `create_schema` for each model:

```
create_schema({
  name: "task",
  fields: {
    title:   { type: "string",  required: true  },
    done:    { type: "boolean", required: false },
    dueDate: { type: "string",  required: false }
  }
})
```

Field types: `"string"` | `"number"` | `"boolean"` | `"date"`.
Registers CRUD tools: `create_<name>`, `read_<name>`, `list_<name>s`, `update_<name>`.

## Step 3 — Custom tools (only for logic beyond CRUD)

Call `create_tool` for each:

```
create_tool({
  name: "send_reminder",
  description: "Send a reminder email for a task",
  inputSchema: { taskId: { type: "string" }, email: { type: "string" } },
  handler: `return { sent: true };`
})
```

## Step 4 — Views (one per UI screen)

Call `create_view` for each screen. Use Tailwind CDN for styling.

```
create_view({
  name: "tasks",
  html: `<!DOCTYPE html>
<html>
<head><title>Tasks</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="p-8 bg-gray-50">
  <h1 class="text-2xl font-bold mb-4">Tasks</h1>
  <ul id="list" class="space-y-2"></ul>
</body>
</html>`
})
```

Views are served at `http://localhost:3333/<name>`.

## Step 5 — Verify

1. Call `list_tools` — confirm all expected tools appear.
2. Open each view URL: `http://localhost:3333/<name>`.
3. Report to the user: tools registered, views available, any gaps.
