# Security and access

- **Identity provider**: OAuth 2 / OpenID Connect. Users: authorization code + PKCE. Services: client credentials. Implicit and password grants are deprecated (RFC 9700, the OAuth 2.0 Security BCP; OAuth 2.1 is still a draft). DPoP (RFC 9449) binds tokens to the client when theft is a concern.
- **Scopes and roles**: coarse scopes in the token, fine-grained checks in the API on every object.
- **Secrets** in a secrets manager, never in the repo or the image.
- **OWASP API Security Top 10 (2023)**, review every endpoint against it:
  1. Broken Object Level Authorization
  2. Broken Authentication
  3. Broken Object Property Level Authorization
  4. Unrestricted Resource Consumption
  5. Broken Function Level Authorization
  6. Unrestricted Access to Sensitive Business Flows
  7. Server Side Request Forgery
  8. Security Misconfiguration
  9. Improper Inventory Management
  10. Unsafe Consumption of APIs
- **Inventory**: every host, version and endpoint listed, including old and internal ones (API9).

Sources: [RFC 9700](https://www.rfc-editor.org/info/rfc9700) · [OAuth 2.1 draft](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/) · [RFC 9449](https://www.rfc-editor.org/info/rfc9449) · [OWASP API Security](https://owasp.org/API-Security/)
