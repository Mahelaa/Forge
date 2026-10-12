# Forge

The client uses individual accounts through the Forge API. It supports registration,
sign-in, email verification, password recovery, profile editing, password changes,
session revocation and account deletion. Administrators can view user profiles.

Run `npm.cmd install` and `npm.cmd run dev`, then open http://localhost:1420.
The default API URL is https://forge-34-170-115-154.sslip.io. The new backend
migration and auth release must be deployed before this URL supports sign-in.

For local development against the sibling server:

```powershell
$env:VITE_FORGE_API_URL='http://127.0.0.1:8080'
npm.cmd run dev
```

Configure the backend database and run `go run . migrate` followed by `go run .`
in `../forge-server`. Its `.env.example` permits local sign-in without an email
provider. SMTP must be configured for verification and recovery, and production
requires verified email accounts and HTTPS. See [the server documentation](../forge-server/readme.md).

`src/api.ts` provides typed account and authentication functions. Access and
refresh tokens stay in memory; refreshing concurrent requests share one rotation.
Reloading requires signing in again. Do not place passwords or session tokens in
`VITE_` variables, URLs, localStorage or sessionStorage. Persistent desktop
sessions should use an OS credential vault.

The backend must allow the frontend origin through `CORS_ORIGINS`. When using a
custom API hostname, update `VITE_FORGE_API_URL` and the CSP allowlists in
`index.html` and `src-tauri/tauri.conf.json`. Email links open this client with a
fragment token; the client removes the fragment and lets the user confirm the
operation. Codes can also be pasted into the desktop client's forms.

Run `npm.cmd run build` to check TypeScript and produce `dist`.
Backend deployment runs automatically when pushing to `master` in
[Mahelaa/forge-server](https://github.com/Mahelaa/forge-server).

Author - shanes
