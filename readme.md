# Forge

The frontend connects to the Forge API at https://forge-34-170-115-154.sslip.io.

Run `npm install` and `npm run dev`, then open http://localhost:1420.
Enter `API_TOKEN` from the sibling `forge-server/.env` file and click Connect.
You can list users, create users, and edit screen names. Account IDs stay as
strings to preserve all 17 digits.

The access token is held in page memory. Do not commit it or put it in a
`VITE_` variable. This is an initial private development interface with a shared
token; individual user sign-in is not implemented yet.

Set `VITE_FORGE_API_URL` to change the API address; see `.env.example`.
The backend must allow the frontend's origin through `CORS_ORIGINS`.

Run `npm run build` to check TypeScript and produce the web build in `dist`.
Backend deployment runs automatically when pushing to `master` in
[Mahelaa/forge-server](https://github.com/Mahelaa/forge-server).

Author - shanes
