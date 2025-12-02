# ✅ NSFW Analyzer Edge Function - Fully Configured!

## 🎉 Setup Complete

**All components are now deployed and configured:**

1. ✅ Edge Function deployed: `analyze-nsfw-content`
2. ✅ Access Code set: `NSFW_ANALYZER_ACCESS_CODE` (secure random code)
3. ✅ Function is ACTIVE and ready to use

**Note**: The access code is different from your Supabase access token. See `NSFW_ANALYZER_ACCESS_CODE.txt` for the code.

## 🚀 Function Endpoint

**URL**: `https://xgblxtopsapvacyaurcr.supabase.co/functions/v1/analyze-nsfw-content`

## 📝 Usage Examples

### JavaScript/TypeScript

```typescript
const analyzeContent = async (contentType: 'clip' | 'post' | 'comment', contentId: string, textContent?: string) => {
  const response = await fetch(
    'https://xgblxtopsapvacyaurcr.supabase.co/functions/v1/analyze-nsfw-content',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-access-code': 'YOUR_NSFW_ANALYZER_ACCESS_CODE', // See NSFW_ANALYZER_ACCESS_CODE.txt
      },
      body: JSON.stringify({
        content_type: contentType,
        content_id: contentId,
        text_content: textContent, // Optional - will fetch from DB if not provided
      }),
    }
  );

  const result = await response.json();
  return result;
};

// Example: Analyze a clip
const result = await analyzeContent('clip', 'clip-id-here');
console.log(result);
// {
//   success: true,
//   is_nsfw: true/false,
//   confidence: 0.75,
//   auto_tagged: true/false,
//   detected_issues: ['sexual content', 'explicit language']
// }
```

### cURL

```bash
curl -X POST https://xgblxtopsapvacyaurcr.supabase.co/functions/v1/analyze-nsfw-content \
  -H "Content-Type: application/json" \
  -H "x-access-code: YOUR_NSFW_ANALYZER_ACCESS_CODE" \
  -d '{
    "content_type": "clip",
    "content_id": "your-clip-id",
    "text_content": "optional text content to analyze"
  }'
```

### Via Supabase Dashboard

1. Go to: **Edge Functions** → **analyze-nsfw-content** → **Invoke**
2. Use this payload:
```json
{
  "content_type": "clip",
  "content_id": "clip-id-here",
  "text_content": "test content",
  "access_code": "YOUR_NSFW_ANALYZER_ACCESS_CODE"
}
```

## 🔒 Security Notes

- ✅ Access code is set as environment variable (secure)
- ✅ Access code required for all requests
- ✅ Uses service role key for database updates
- ⚠️ Keep the access code private - stored in `NSFW_ANALYZER_ACCESS_CODE.txt`
- ⚠️ Don't expose in frontend code - create a proxy API route server-side
- ⚠️ Different from Supabase access token - this is specific to the NSFW analyzer function

## 🎯 What It Does

1. **Analyzes Content**: Uses pattern matching + OpenAI moderation API
2. **Detects NSFW**: Identifies sexual, violent, or explicit content
3. **Auto-Tags**:
   - Clips → Sets `content_rating = "sensitive"`
   - Posts → Sets `is_nsfw = true`
4. **Creates Flags**: Adds moderation flags for admin review (if confidence >= 0.25)

## 📊 Response Format

```typescript
{
  success: boolean;           // true if analysis completed
  is_nsfw: boolean;           // true if NSFW content detected
  confidence: number;         // 0-1 scale (detection confidence)
  auto_tagged: boolean;       // true if content was auto-tagged
  detected_issues?: string[]; // Array of detected issue types
}
```

## 🔄 Integration Ideas

### Auto-analyze on upload:

```typescript
// In your clip upload handler
const { data: clip } = await supabase
  .from('clips')
  .insert({ ...clipData })
  .select()
  .single();

// Trigger analysis (async, don't block)
fetch('https://xgblxtopsapvacyaurcr.supabase.co/functions/v1/analyze-nsfw-content', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-access-code': 'YOUR_NSFW_ANALYZER_ACCESS_CODE', // Get from NSFW_ANALYZER_ACCESS_CODE.txt
  },
  body: JSON.stringify({
    content_type: 'clip',
    content_id: clip.id,
  }),
}).catch(console.error);
```

### Batch analyze existing content:

```typescript
// Get clips that need analysis
const { data: clips } = await supabase
  .from('clips')
  .select('id, captions')
  .eq('status', 'live')
  .is('content_rating', null)
  .limit(10);

// Analyze each
for (const clip of clips) {
  await analyzeContent('clip', clip.id, clip.captions);
  await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
}
```

## 🐛 Troubleshooting

### 401 Unauthorized
- Verify access code is correct: `sbp_1de8f39cf26dc293418a610c5383a815ec98652e`
- Check it's included in header `x-access-code` or request body

### 500 Internal Server Error
- Check function logs in Supabase Dashboard
- Verify `OPENAI_API_KEY` is set in secrets
- Check database permissions

### Auto-tagging not working
- Verify content_id exists in database
- Check function logs for errors
- Ensure confidence >= 0.25 for auto-tagging

## ✅ Status

- **Function**: ✅ Deployed and ACTIVE
- **Access Code**: ✅ Set and configured
- **Environment**: ✅ Production ready
- **Status**: 🚀 **Ready to use!**

---

**Function Dashboard**: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/functions/analyze-nsfw-content

