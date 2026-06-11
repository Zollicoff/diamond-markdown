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

Do not expose the Node server directly to the public internet. Diamond Markdown
does not include built-in multi-user authentication or authorization.

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

Example isolated production-ish run:

```sh
DIAMOND_CONFIG_DIR=/srv/diamond/config \
DIAMOND_DEFAULT_VAULT_DIR=/srv/diamond/vault \
HOST=127.0.0.1 \
PORT=4173 \
node build
```

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
- Vault paths are trusted local directories.
- Git credentials are managed by SSH agent or credential helper.
- Dependencies pass `npm audit --audit-level=moderate`.
- Release verification passes the commands in `docs/release-checklist.md`.
