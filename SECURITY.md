# Security Policy

Diamond Markdown is designed as a single-user, self-hosted knowledge base. It
has filesystem and git access to every registered vault, so treat the server as
trusted software with access to private notes.

## Supported Versions

Diamond Markdown is pre-1.0. Security fixes target the current `main` branch
until versioned releases begin.

## Deployment Guidance

- Run on localhost, behind Tailscale, or behind a trusted reverse proxy.
- Do not expose the server directly to the public internet without an
  authentication layer in front of it.
- Register only vault directories you trust.
- Use `DIAMOND_READ_ONLY=true` for browse-only demos, but do not treat it as
  an authentication layer.
- Keep dependencies current and run `npm audit --audit-level=moderate` before
  releases.

Detailed self-hosting guidance lives in `docs/self-hosting.md`. Release
verification lives in `docs/release-checklist.md`.

## Reporting A Vulnerability

Please do not open a public issue for a private-note exposure, path traversal,
authentication bypass, XSS, or remote code execution concern.

Email the maintainer or use a private channel with:
- affected version or commit
- reproduction steps
- impact
- any proof-of-concept files or requests

## Security Model

The app currently assumes one trusted user. It does not provide built-in
multi-user authentication or authorization. The server rejects vault path
escapes and symlink escapes through `src/lib/server/paths.ts`; new filesystem
routes must use that resolver rather than reading client-supplied paths
directly.

When `DIAMOND_READ_ONLY=true`, the server hook rejects non-GET API requests
before they reach route handlers. This is intended for public browsing and demo
deployments where vault content should be visible but not editable.
