# Auth Setup (Supabase)

The app now requires sign-in and no longer uses the old shared commissioner
passcode (`0988`) that was hardcoded in the page. Authentication is handled by
Supabase using **passwordless magic links** and **Google OAuth** — no passwords
are stored anywhere.

## Why the confirmation email went to `localhost`

Supabase builds confirmation / magic links from the **Site URL** configured in
your project. If that's left at `http://localhost:3000` (the default), every
link — even one opened on your phone — points back at `localhost`, which only
resolves to the device that generated it. The fix is two-sided:

- **Code side (done):** the app passes `emailRedirectTo` /`redirectTo` =
  `window.location.origin + pathname`, so links come back to whatever host the
  user is actually on.
- **Dashboard side (you must do this):** set the Site URL and Redirect URLs to
  your real deployed domain, as below.

## 1. Create the project & keys

1. Create a project at <https://supabase.com>.
2. In **Project Settings → API**, copy the **Project URL** and the **anon /
   publishable key**.
3. In `index.html`, near the top of the page script, set:
   ```js
   const SUPABASE_URL = "https://YOURPROJECT.supabase.co";
   const SUPABASE_ANON_KEY = "eyJhbGc...";   // anon/publishable key
   ```
   The anon key is meant to be public and safe to ship in client code — data is
   protected by Row Level Security, not by hiding this key.

## 2. Fix the redirect (the localhost bug)

**Authentication → URL Configuration:**

- **Site URL:** `https://your-deployed-domain`
- **Redirect URLs** (add each):
  - `https://your-deployed-domain/**`
  - `http://localhost:8000/**`  ← for local development

Without the domain in this allow-list, Supabase falls back to the Site URL and
the link "fires back to localhost."

## 3. Enable sign-in methods

- **Magic link:** Authentication → Providers → **Email** is on by default.
- **Google:** Authentication → Providers → **Google** → enable, then paste the
  OAuth Client ID/Secret from a Google Cloud OAuth 2.0 client whose authorized
  redirect URI is `https://YOURPROJECT.supabase.co/auth/v1/callback`.

## 4. Who is a commissioner

Commissioner tools (refresh rosters, sync stats, finalize week, reorder draft)
are gated by identity, not a shared passcode. Add the commissioners' sign-in
emails to `COMMISSIONER_EMAILS` in `index.html`:

```js
const COMMISSIONER_EMAILS = ["commish@example.com"];
```

Anyone signed in can view; only listed emails can toggle commissioner tools.

## Note on enforcement

This app is client-side, so identity gating here is a UI control. For real
enforcement (preventing tampering with league data), move league state into
Supabase tables and enforce writes with Row Level Security policies keyed on
`auth.uid()` / the commissioner list. The identity foundation added here is
what makes that possible.
