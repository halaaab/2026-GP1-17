# Backend

This folder holds the files of Server 2, Supabase: authentication and the PostgreSQL database (with pgvector for the startup embeddings), protected by Row Level Security.

| Folder | Contents |
|---|---|
| `supabase/migrations/` | Database tables and security rules |
| `supabase/seed/` | Starting data for the database |
| `supabase/email-templates/` | Emails sent to users, such as sign-up confirmation |

The agents are in `agent-server/`, and the survival model code is in `ml/`.
