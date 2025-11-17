# API & Integrations Feature - Implementation Summary

This document summarizes the implementation of the API & Integrations feature for Echo Garden.

## ✅ Completed Components

### 1. Database Migration (`20251208000000_add_api_and_webhooks.sql`)

**Tables Created:**
- `api_keys` - Stores API keys with hashing, scopes, rate limits, and expiration
- `webhooks` - Stores webhook configurations (URL, events, secrets)
- `webhook_deliveries` - Logs all webhook delivery attempts
- `api_usage_logs` - Tracks API usage for analytics

**Functions Created:**
- `generate_api_key()` - Generates new API keys (returns plain text once)
- `validate_api_key()` - Validates API keys and returns metadata
- `trigger_webhooks()` - Triggers webhooks for events

**Triggers:**
- Automatic webhook triggering on clip events (created, updated, deleted)

### 2. Public API Edge Function (`supabase/functions/public-api/index.ts`)

**Features:**
- API key authentication
- Rate limiting per API key
- API versioning support
- CORS headers
- Request logging

**Endpoints:**
- `GET /` - API information
- `GET /clips` - List clips (with pagination, filtering)
- `GET /clips/:id` - Get single clip
- `GET /profiles` - List profiles
- `GET /profiles/:id` - Get single profile
- `GET /topics` - List topics
- `GET /topics/:id` - Get single topic
- `GET /search?q=query` - Search clips

**Authentication:**
- API key via `X-API-Key` header or `Authorization: Bearer` header
- Scopes: `read`, `write`, `webhooks`, `admin` (future)

**Rate Limiting:**
- Default: 60 requests/minute per API key
- Customizable per API key
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### 3. Webhooks Edge Function (`supabase/functions/deliver-webhooks/index.ts`)

**Features:**
- Processes pending webhook deliveries
- HMAC-SHA256 signature generation for security
- Automatic retry with failure tracking
- Webhook deactivation after max failures
- Delivery logging

**Events Supported:**
- `clip.created` - New clip published
- `clip.updated` - Clip updated (reactions, listens)
- `clip.deleted` - Clip deleted or hidden

**Security:**
- HMAC-SHA256 signatures
- Timestamp verification
- Secret-based validation

**Usage:**
- Call via cron job or manually
- Protected with `WEBHOOK_CRON_SECRET` environment variable

### 4. Embed Functionality (`src/pages/Embed.tsx`)

**Features:**
- Standalone embed page for clips
- Audio player with play/pause
- Transcript display
- Embed code generation
- Responsive design

**Route:**
- `/embed/:clipId` - Public embed page (no authentication required)

**Embed Code Format:**
```html
<iframe 
  src="https://your-domain.com/embed/clip-uuid" 
  width="400" 
  height="300" 
  frameborder="0" 
  allow="autoplay">
</iframe>
```

### 5. API Documentation (`API_DOCUMENTATION.md`)

**Contents:**
- Getting started guide
- Authentication instructions
- Rate limiting details
- All endpoint documentation
- Webhooks guide
- Embedding guide
- Error handling
- Code examples (JavaScript, Python, cURL)

## 🔧 Setup Instructions

### 1. Run Database Migration

```bash
# Apply the migration
supabase migration up
# Or manually run the SQL file in your Supabase dashboard
```

### 2. Deploy Edge Functions

```bash
# Deploy public API
supabase functions deploy public-api

# Deploy webhooks
supabase functions deploy deliver-webhooks
```

### 3. Set Environment Variables

For `deliver-webhooks` function:
```
WEBHOOK_CRON_SECRET=your-secret-here
```

### 4. Set Up Cron Job (Optional)

To automatically process webhooks, set up a cron job:

```bash
# Every minute
*/1 * * * * curl -H "Authorization: Bearer YOUR_WEBHOOK_CRON_SECRET" \
  https://your-project.supabase.co/functions/v1/deliver-webhooks
```

Or use Supabase's pg_cron extension:

```sql
SELECT cron.schedule(
  'deliver-webhooks',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/deliver-webhooks',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_WEBHOOK_CRON_SECRET'
    )
  );
  $$
);
```

## 📝 Next Steps

### UI Components Needed

1. **API Keys Management Page** (Settings → API Keys)
   - Generate new API keys
   - List existing keys
   - Revoke keys
   - View usage stats

2. **Webhooks Management Page** (Settings → Webhooks)
   - Create webhooks
   - List webhooks
   - View delivery logs
   - Test webhooks

3. **Share Dialog Enhancement**
   - Add "Embed" option to share dialog
   - Show embed code with copy button

### Example UI Implementation

```typescript
// In Settings page, add API Keys section
const ApiKeysSection = () => {
  const [keys, setKeys] = useState([]);
  
  const generateKey = async () => {
    const { data } = await supabase.rpc('generate_api_key', {
      p_profile_id: profile.id,
      p_name: 'My API Key',
      p_scopes: ['read'],
      p_rate_limit_per_minute: 60
    });
    // Show key to user (only once!)
    alert(`Your API key: ${data}`);
  };
  
  // ... rest of component
};
```

## 🔒 Security Considerations

1. **API Keys:**
   - Keys are hashed using SHA-256 (consider bcrypt for production)
   - Keys are only shown once when generated
   - Keys can be revoked/deactivated

2. **Webhooks:**
   - HMAC-SHA256 signatures prevent tampering
   - Timestamp verification prevents replay attacks
   - Secrets are stored securely

3. **Rate Limiting:**
   - Prevents abuse and DDoS
   - Configurable per API key
   - Headers provide transparency

4. **CORS:**
   - Configurable via `ORIGIN` environment variable
   - Defaults to `*` (should be restricted in production)

## 📊 Monitoring

- API usage is logged in `api_usage_logs` table
- Webhook deliveries are logged in `webhook_deliveries` table
- Failed webhooks are tracked and can be retried

## 🚀 Future Enhancements

1. **Write API Endpoints:**
   - Create clips via API
   - Update clips
   - Delete clips

2. **Additional Webhook Events:**
   - `reaction.created`
   - `comment.created`
   - `profile.updated`

3. **OAuth Integration:**
   - OAuth 2.0 support
   - Third-party app integrations

4. **Zapier Integration:**
   - Zapier app for automation
   - Pre-built zaps

5. **API Analytics Dashboard:**
   - Usage charts
   - Popular endpoints
   - Error rates

## 📚 Resources

- [API Documentation](./API_DOCUMENTATION.md)
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Webhooks Best Practices](https://webhooks.fyi/)

---

**Status:** ✅ Core implementation complete
**Next:** Add UI components for API key and webhook management

