# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly using a private channel.

**Preferred channel:** Use your repository host's private vulnerability reporting feature, or the private security contact configured for your deployment.

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgment:** Within 48 hours
- **Assessment:** Within 7 days
- **Fix timeline:** Depends on severity, typically within 30 days
- **Public disclosure:** 90 days after report, or when fix is released (whichever is first)

### Scope

The following are in scope:
- Authentication and authorization bypasses
- SQL injection or RLS policy bypasses
- Cross-site scripting (XSS)
- Sensitive data exposure
- Server-side request forgery (SSRF)
- Remote code execution

### Out of scope

- Denial of service attacks
- Social engineering
- Issues in third-party dependencies (report to the upstream project)
- Issues requiring physical access to a user's device

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |

## Security Best Practices for Self-Hosting

1. **Never commit `.env` files** — use environment variables or secret managers
2. **Enable RLS** on all Supabase tables — the migrations do this by default
3. **Use a strong `SUPABASE_SERVICE_ROLE_KEY`** — never expose it to the frontend
4. **Keep dependencies updated** — run `npm audit` regularly
5. **Use HTTPS** in production
6. **Set up proper CORS** — the edge functions handle this, but verify for your domain
