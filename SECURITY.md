# Security Guide for Echo Garden

This document outlines security best practices and measures implemented in Echo Garden.

## 🔒 Security Features

### Authentication & Authorization

- **Device-based Authentication**: Users are identified by device IDs stored in localStorage
- **Magic Login Links**: Secure passwordless authentication via time-limited, single-use tokens
- **Row Level Security (RLS)**: Database policies enforce access control at the database level
- **Profile-based Access**: Users can only access their own data and public content

### Data Protection

- **Environment Variables**: All sensitive credentials are stored in environment variables
- **No Hardcoded Secrets**: Database credentials and API keys are never committed to the repository
- **Encrypted Storage**: Supabase handles encryption at rest and in transit
- **HTTPS Only**: All API communications use HTTPS

### Input Validation

- **Client-side Validation**: React Hook Form with Zod schemas for form validation
- **Server-side Validation**: Supabase RLS policies and Edge Functions validate all inputs
- **SQL Injection Prevention**: Using parameterized queries via Supabase client
- **XSS Prevention**: React automatically escapes user input

### Content Security

- **AI Moderation**: All clips are automatically moderated using OpenAI's moderation API
- **Community Reporting**: Users can report inappropriate content
- **Admin Review**: Flagged content is reviewed by administrators
- **Content Filtering**: Hidden content is not visible to public users

## 🛡️ Security Headers

When deploying, ensure your hosting provider sets these security headers:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co https://api.openai.com; media-src 'self' https://*.supabase.co;
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: microphone=(), camera=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## 🔐 Environment Variables

### Required for Development

1. **VITE_SUPABASE_URL**: Your Supabase project URL
2. **VITE_SUPABASE_PUBLISHABLE_KEY**: Your Supabase anon/public key

### Required for Supabase Edge Functions

1. **OPENAI_API_KEY**: OpenAI API key for transcription and moderation
2. **SUPABASE_URL**: Supabase project URL (for Edge Functions)
3. **SUPABASE_SERVICE_ROLE_KEY**: Supabase service role key (for Edge Functions)

### Optional (for admin scripts)

- **DB_HOST**: Database host
- **DB_PORT**: Database port (default: 6543)
- **DB_USER**: Database user
- **DB_PASSWORD**: Database password
- **DB_NAME**: Database name (default: postgres)

## 🚨 Security Checklist

Before deploying to production:

- [x] All environment variables are set and not committed to git
  - ✅ `.env` files are in `.gitignore` (verified)
  - ✅ Environment variables documented in this file
- [ ] Database credentials are rotated and secure
  - ⚠️ **Action Required**: Rotate Supabase service role key before production
  - ⚠️ **Action Required**: Ensure database passwords are strong and unique
- [x] Supabase RLS policies are properly configured
  - ✅ RLS enabled on all tables (verified in migrations)
  - ✅ Policies implemented for profiles, clips, reports, and other sensitive tables
- [ ] CORS is configured to allow only trusted origins
  - ⚠️ **Action Required**: Configure CORS in Supabase Dashboard → Settings → API
  - ⚠️ **Action Required**: Add your production domain to allowed origins
- [ ] Security headers are configured on your hosting provider
  - 📋 See "Security Headers" section above for required headers
  - ⚠️ **Action Required**: Configure on hosting provider (Vercel, Netlify, etc.)
- [ ] HTTPS is enforced (no HTTP access)
  - ⚠️ **Action Required**: Enable HTTPS redirect on hosting provider
  - ⚠️ **Action Required**: Verify SSL certificate is valid
- [x] API rate limiting is configured
  - ✅ Database-level rate limiting implemented (verified)
  - ✅ Clip upload rate limiting: 10/hour, 50/day per profile
  - ✅ Account creation rate limiting: IP-based limits
  - ✅ Query rate limiting: Per-profile limits
  - ✅ API key rate limiting: Configurable per key
- [ ] Regular security audits are scheduled
  - ⚠️ **Action Required**: Set up quarterly security reviews
  - ⚠️ **Action Required**: Monitor Supabase security dashboard
- [x] Error messages don't expose sensitive information
  - ✅ Centralized error handling implemented
  - ✅ Generic error messages for users
  - ⚠️ **Review**: Verify all error handlers use generic messages
- [x] Logs don't contain sensitive data (passwords, tokens, etc.)
  - ✅ Centralized logger with sanitization (verified in `src/lib/logger.ts`)
  - ✅ Sensitive patterns automatically redacted: passwords, tokens, keys, credentials
  - ✅ Production logs filtered to WARN/ERROR only

## 🔍 Security Best Practices

### For Developers

1. **Never commit secrets**: Use environment variables for all sensitive data
2. **Use parameterized queries**: Always use Supabase client methods, never raw SQL with user input
3. **Validate all inputs**: Both client-side and server-side validation
4. **Keep dependencies updated**: Regularly update npm packages for security patches
5. **Review RLS policies**: Ensure database policies are correctly configured
6. **Use HTTPS**: Always use HTTPS in production
7. **Limit CORS**: Only allow necessary origins
8. **Monitor logs**: Regularly review application logs for suspicious activity

### For Administrators

1. **Regular audits**: Review user reports and moderation flags regularly
2. **Access control**: Limit admin access to trusted users only
3. **Backup security**: Ensure backups are encrypted and access-controlled
4. **Incident response**: Have a plan for security incidents
5. **User data**: Follow GDPR/privacy regulations for user data handling

## 🐛 Reporting Security Issues

If you discover a security vulnerability, please:

1. **Do NOT** create a public GitHub issue
2. Email security concerns to: [your-security-email]
3. Include details about the vulnerability
4. Allow time for the issue to be addressed before public disclosure

## 📚 Additional Resources

- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Web Security Guidelines](https://developer.mozilla.org/en-US/docs/Web/Security)

## 🔄 Security Updates

This document should be reviewed and updated regularly as the application evolves and new security measures are implemented.

Last updated: 2025-01-XX

