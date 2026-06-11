# Self-Hosting Diamond Markdown

Diamond Markdown is a single-user SvelteKit app with filesystem and git access
to registered vaults. Treat the server like a trusted local desktop app: it can
read, write, delete, and commit files inside every configured vault.

## Recommended Deployment

Use one of these deployment shapes:

- Localhost only: run on `127.0.0.1` and open it from the same machine.
- Private network: expose through Tailscale, WireGuard, or a trusted LAN.
- Reverse proxy: put authentication in front of Diamond Markdown before any
  internet exposure.
- Built-in Basic Auth: set `DIAMOND_BASIC_AUTH` for a simple single-user
  password gate on all pages and APIs except `/api/health`.

Do not expose the Node server directly to the public internet without Basic
Auth or a trusted proxy auth layer. Diamond Markdown does not include multi-user
authentication or per-vault authorization.

## Requirements

- Node 20 or newer
- Git available on `PATH`
- A trusted markdown vault directory
- GitHub credentials if you use Settings -> GitHub sync

For GitHub sync, prefer SSH remotes or an OS/git credential helper. Avoid
putting tokens in remote URLs. The app only accepts GitHub HTTPS and SSH
remotes for the in-app sync panel.

## Build And Run

```sh
npm install
npm run build
HOST=127.0.0.1 PORT=4173 node build
```

Useful environment variables:

- `HOST`: bind host, for example `127.0.0.1` for local-only.
- `PORT`: HTTP port.
- `DIAMOND_CONFIG_DIR`: where `config.json` is stored.
- `DIAMOND_DEFAULT_VAULT_DIR`: first-run vault destination.
- `DIAMOND_BASIC_AUTH`: optional `username:password` Basic Auth credentials.
- `DIAMOND_BASIC_AUTH_REALM`: optional browser prompt realm. Defaults to
  `Diamond Markdown`.
- `DIAMOND_READ_ONLY`: set to `true`, `1`, `yes`, or `on` to block write
  APIs for public demos or browse-only vaults.

Example isolated production-ish run:

```sh
DIAMOND_CONFIG_DIR=/srv/diamond/config \
DIAMOND_DEFAULT_VAULT_DIR=/srv/diamond/vault \
HOST=127.0.0.1 \
PORT=4173 \
node build
```

## Basic Auth

Basic Auth is a simple single-user guard for small self-hosted installs:

```sh
DIAMOND_BASIC_AUTH='zach:use-a-long-random-password' \
HOST=127.0.0.1 \
PORT=4173 \
node build
```

All pages and vault APIs require the configured credentials. `/api/health` stays
available without credentials so local process monitors can check liveness
without storing note-access credentials.

Use HTTPS at the reverse proxy or a private tunnel such as Tailscale. Basic Auth
credentials are only encoded by the browser, not encrypted by HTTP itself.

## Read-Only Mode

Read-only mode is for demos and public browsing. It keeps the normal vault UI
available, but all non-GET API requests return `403`, so note edits, vault
changes, folder operations, publishing, plugin installs, and GitHub sync actions
are disabled server-side.

```sh
DIAMOND_READ_ONLY=true HOST=127.0.0.1 PORT=4173 node build
```

`/api/health` reports the active mode:

```json
{ "ok": true, "service": "diamondmarkdown", "readOnly": true }
```

Read-only mode is not authentication. Keep the server on localhost, Tailscale,
or behind a trusted authenticated proxy if the vault is private.

## Process Manager

Run the app under a service manager such as systemd, launchd, pm2, or Docker.
The service account should have access only to the vaults it needs.

Minimum systemd shape:

```ini
[Unit]
Description=Diamond Markdown
After=network.target

[Service]
WorkingDirectory=/opt/diamondmarkdown
ExecStart=/usr/bin/env HOST=127.0.0.1 PORT=4173 node build
Restart=on-failure
User=diamond
Environment=DIAMOND_CONFIG_DIR=/srv/diamond/config
Environment=DIAMOND_DEFAULT_VAULT_DIR=/srv/diamond/vault

[Install]
WantedBy=multi-user.target
```

## Reverse Proxy Notes

If you proxy the app, terminate TLS and require authentication at the proxy.
Forward normal HTTP traffic to the local Node process.

Operational checks:

- Proxy requires login before reaching Diamond Markdown.
- Upload/body limits are high enough for image assets in the vault.
- Requests to `/api/vaults/.../raw/...` keep `x-content-type-options: nosniff`.
- The app is not reachable directly on its Node port from untrusted networks.

## Backups

Git history is useful, but it is not a full backup plan.

- Back up vault folders, including `.git`.
- Back up `DIAMOND_CONFIG_DIR` or `~/.diamondmd/config.json`.
- Verify restore by cloning/copying the vault to a fresh path and opening it.
- Push to GitHub only after confirming the remote should contain those notes.

## Upgrade Checklist

1. Stop the running service.
2. Back up the vault and config directory.
3. Pull or deploy the new app version.
4. Run `npm install` if dependencies changed.
5. Run `npm run build`.
6. Start the service.
7. Open Settings -> GitHub sync and confirm the vault is clean or intentionally dirty.
8. Open a note, edit it, confirm it saves, and confirm git history shows the commit.

## Security Checklist

- Server is localhost/private-network only, or protected by proxy auth.
- `DIAMOND_BASIC_AUTH` is enabled for any internet-reachable single-user
  deployment that does not already sit behind trusted proxy authentication.
- Vault paths are trusted local directories.
- Git credentials are managed by SSH agent or credential helper.
- `DIAMOND_READ_ONLY=true` is enabled for public demo vaults that should not be
  editable.
- Dependencies pass `npm audit --audit-level=moderate`.
- Release verification passes the commands in `docs/release-checklist.md`.
