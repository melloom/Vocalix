# Echo Garden API Documentation

Welcome to the Echo Garden API! This document provides comprehensive information about using our REST API to interact with Echo Garden programmatically.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [Rate Limiting](#rate-limiting)
4. [API Endpoints](#api-endpoints)
5. [Webhooks](#webhooks)
6. [Embedding Clips](#embedding-clips)
7. [Error Handling](#error-handling)
8. [Code Examples](#code-examples)

---

## Getting Started

### Base URL

```
https://your-project.supabase.co/functions/v1/public-api
```

### API Versioning

The API supports versioning via headers or query parameters:

- **Header**: `X-API-Version: 1.0.0`
- **Accept Header**: `Accept: application/vnd.echogarden+json;version=1.0.0`
- **Query Parameter**: `?version=1.0.0`

Default version: `1.0.0`

### Response Format

All responses are JSON with the following structure:

```json
{
  "data": { ... },
  "pagination": {
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## Authentication

### API Keys

To use the API, you need an API key. API keys are scoped with permissions:

- `read` - Read-only access to public data
- `write` - Create and update resources (future)
- `webhooks` - Manage webhooks (future)
- `admin` - Full access (future)

### Getting an API Key

1. Log in to Echo Garden
2. Go to Settings → API Keys
3. Click "Generate New API Key"
4. **Important**: Copy the key immediately - it won't be shown again!

### Using Your API Key

Include your API key in the request header:

```http
X-API-Key: eg_your_api_key_here
```

Or in the Authorization header:

```http
Authorization: Bearer eg_your_api_key_here
```

### Example Request

```bash
curl -H "X-API-Key: eg_your_api_key_here" \
  https://your-project.supabase.co/functions/v1/public-api/clips
```

---

## Rate Limiting

Rate limits are applied per API key:

- **Default**: 60 requests per minute
- **Custom**: Can be configured per API key

Rate limit information is included in response headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 2024-01-01T12:00:00Z
```

When rate limited, you'll receive a `429 Too Many Requests` response:

```json
{
  "error": "Rate limit exceeded",
  "message": "You have exceeded the rate limit of 60 requests per minute",
  "retryAfter": 30
}
```

---

## API Endpoints

### Clips

#### List Clips

Get a paginated list of clips.

```http
GET /clips
```

**Query Parameters:**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Number of results per page | 20 |
| `offset` | integer | Number of results to skip | 0 |
| `topic_id` | UUID | Filter by topic | - |
| `profile_id` | UUID | Filter by profile | - |
| `status` | string | Filter by status (`live`, `processing`) | `live` |

**Example Request:**

```bash
curl -H "X-API-Key: eg_your_api_key_here" \
  "https://your-project.supabase.co/functions/v1/public-api/clips?limit=10&offset=0"
```

**Example Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "profile_id": "uuid",
      "audio_path": "path/to/audio.mp3",
      "duration_seconds": 30,
      "title": "My Voice Clip",
      "captions": "This is a transcript...",
      "summary": "Summary of the clip",
      "tags": ["tag1", "tag2"],
      "mood_emoji": "😊",
      "listens_count": 42,
      "reactions": {
        "😊": 5,
        "❤️": 3
      },
      "created_at": "2024-01-01T12:00:00Z",
      "topic_id": "uuid",
      "profiles": {
        "id": "uuid",
        "handle": "username",
        "emoji_avatar": "🎧"
      },
      "topics": {
        "id": "uuid",
        "title": "Daily Topic",
        "date": "2024-01-01"
      }
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

#### Get Single Clip

Get details about a specific clip.

```http
GET /clips/:id
```

**Example Request:**

```bash
curl -H "X-API-Key: eg_your_api_key_here" \
  "https://your-project.supabase.co/functions/v1/public-api/clips/clip-uuid-here"
```

**Example Response:**

```json
{
  "data": {
    "id": "uuid",
    "profile_id": "uuid",
    "audio_path": "path/to/audio.mp3",
    "duration_seconds": 30,
    "title": "My Voice Clip",
    "captions": "This is a transcript...",
    "summary": "Summary of the clip",
    "tags": ["tag1", "tag2"],
    "mood_emoji": "😊",
    "listens_count": 42,
    "reactions": {
      "😊": 5,
      "❤️": 3
    },
    "created_at": "2024-01-01T12:00:00Z",
    "topic_id": "uuid",
    "profiles": {
      "id": "uuid",
      "handle": "username",
      "emoji_avatar": "🎧"
    },
    "topics": {
      "id": "uuid",
      "title": "Daily Topic",
      "date": "2024-01-01"
    }
  }
}
```

### Profiles

#### List Profiles

Get a paginated list of profiles.

```http
GET /profiles
```

**Query Parameters:**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Number of results per page | 20 |
| `offset` | integer | Number of results to skip | 0 |

**Example Request:**

```bash
curl -H "X-API-Key: eg_your_api_key_here" \
  "https://your-project.supabase.co/functions/v1/public-api/profiles"
```

**Example Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "handle": "username",
      "emoji_avatar": "🎧",
      "joined_at": "2024-01-01T12:00:00Z",
      "created_at": "2024-01-01T12:00:00Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

#### Get Single Profile

Get details about a specific profile.

```http
GET /profiles/:id
```

**Example Request:**

```bash
curl -H "X-API-Key: eg_your_api_key_here" \
  "https://your-project.supabase.co/functions/v1/public-api/profiles/profile-uuid-here"
```

### Topics

#### List Topics

Get a paginated list of topics.

```http
GET /topics
```

**Query Parameters:**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Number of results per page | 20 |
| `offset` | integer | Number of results to skip | 0 |
| `active` | boolean | Filter by active status | - |

**Example Request:**

```bash
curl -H "X-API-Key: eg_your_api_key_here" \
  "https://your-project.supabase.co/functions/v1/public-api/topics?active=true"
```

**Example Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "What made you smile today?",
      "description": "Share a moment of joy",
      "date": "2024-01-01",
      "is_active": true,
      "created_at": "2024-01-01T12:00:00Z",
      "updated_at": "2024-01-01T12:00:00Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

#### Get Single Topic

Get details about a specific topic.

```http
GET /topics/:id
```

### Search

#### Search Clips

Search clips by title, captions, or summary.

```http
GET /search?q=query
```

**Query Parameters:**

| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| `q` | string | Search query | Yes |
| `limit` | integer | Number of results per page | No (default: 20) |
| `offset` | integer | Number of results to skip | No (default: 0) |

**Example Request:**

```bash
curl -H "X-API-Key: eg_your_api_key_here" \
  "https://your-project.supabase.co/functions/v1/public-api/search?q=voice%20note"
```

**Example Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "profile_id": "uuid",
      "audio_path": "path/to/audio.mp3",
      "title": "My Voice Note",
      "captions": "This is a voice note about...",
      "listens_count": 42,
      "created_at": "2024-01-01T12:00:00Z",
      "profiles": {
        "id": "uuid",
        "handle": "username",
        "emoji_avatar": "🎧"
      }
    }
  ],
  "query": "voice note",
  "pagination": {
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## Webhooks

Webhooks allow you to receive real-time notifications when events occur in Echo Garden.

### Supported Events

- `clip.created` - A new clip is published
- `clip.updated` - A clip is updated (e.g., reactions, listens)
- `clip.deleted` - A clip is deleted or hidden

### Creating a Webhook

1. Log in to Echo Garden
2. Go to Settings → Webhooks
3. Click "Create Webhook"
4. Enter your webhook URL
5. Select the events you want to subscribe to
6. Save the webhook

### Webhook Payload

Webhooks are sent as POST requests to your URL with the following structure:

```json
{
  "id": "webhook-delivery-uuid",
  "event": "clip.created",
  "timestamp": 1704110400000,
  "data": {
    "id": "clip-uuid",
    "profile_id": "profile-uuid",
    "audio_path": "path/to/audio.mp3",
    "duration_seconds": 30,
    "title": "My Voice Clip",
    "captions": "This is a transcript...",
    "created_at": "2024-01-01T12:00:00Z"
  }
}
```

### Webhook Security

Each webhook includes a signature header for verification:

```
X-EchoGarden-Event: clip.created
X-EchoGarden-Timestamp: 1704110400000
X-EchoGarden-Signature: sha256=abc123...
```

To verify the signature:

1. Concatenate the timestamp and payload: `{timestamp}.{payload}`
2. Compute HMAC-SHA256 with your webhook secret
3. Compare with the signature header

### Example Webhook Handler

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, timestamp, secret) {
  const message = `${timestamp}.${payload}`;
  const hash = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  
  return `sha256=${hash}` === signature;
}

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-echogarden-signature'];
  const timestamp = req.headers['x-echogarden-timestamp'];
  const event = req.headers['x-echogarden-event'];
  const payload = JSON.stringify(req.body);
  
  if (!verifyWebhook(payload, signature, timestamp, WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process webhook
  console.log(`Received ${event}:`, req.body);
  
  res.status(200).send('OK');
});
```

---

## Embedding Clips

You can embed Echo Garden clips on your website using an iframe.

### Embed Code

```html
<iframe 
  src="https://your-domain.com/embed/clip-uuid-here" 
  width="400" 
  height="300" 
  frameborder="0" 
  allow="autoplay">
</iframe>
```

### Getting the Embed Code

1. Navigate to any clip
2. Click the "Share" button
3. Select "Embed"
4. Copy the embed code

### Customization

The embed page automatically adapts to the clip content and includes:
- Audio player with play/pause controls
- Clip title and metadata
- Transcript (if available)
- Creator information

---

## Error Handling

### Error Response Format

```json
{
  "error": "Error type",
  "message": "Human-readable error message"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `400` | Bad Request - Invalid parameters |
| `401` | Unauthorized - Invalid or missing API key |
| `404` | Not Found - Resource doesn't exist |
| `405` | Method Not Allowed - HTTP method not supported |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error - Server error |

### Example Error Responses

**Invalid API Key:**

```json
{
  "error": "Invalid or missing API key",
  "message": "Please provide a valid API key in the X-API-Key header"
}
```

**Resource Not Found:**

```json
{
  "error": "Clip not found"
}
```

**Rate Limit Exceeded:**

```json
{
  "error": "Rate limit exceeded",
  "message": "You have exceeded the rate limit of 60 requests per minute",
  "retryAfter": 30
}
```

---

## Code Examples

### JavaScript/Node.js

```javascript
const API_KEY = 'eg_your_api_key_here';
const API_URL = 'https://your-project.supabase.co/functions/v1/public-api';

async function getClips(limit = 20, offset = 0) {
  const response = await fetch(
    `${API_URL}/clips?limit=${limit}&offset=${offset}`,
    {
      headers: {
        'X-API-Key': API_KEY,
      },
    }
  );
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return await response.json();
}

// Usage
getClips(10, 0).then(data => {
  console.log('Clips:', data.data);
  console.log('Has more:', data.pagination.hasMore);
});
```

### Python

```python
import requests

API_KEY = 'eg_your_api_key_here'
API_URL = 'https://your-project.supabase.co/functions/v1/public-api'

def get_clips(limit=20, offset=0):
    headers = {
        'X-API-Key': API_KEY
    }
    
    params = {
        'limit': limit,
        'offset': offset
    }
    
    response = requests.get(f'{API_URL}/clips', headers=headers, params=params)
    response.raise_for_status()
    
    return response.json()

# Usage
data = get_clips(10, 0)
print('Clips:', data['data'])
print('Has more:', data['pagination']['hasMore'])
```

### cURL

```bash
# Get clips
curl -H "X-API-Key: eg_your_api_key_here" \
  "https://your-project.supabase.co/functions/v1/public-api/clips?limit=10"

# Get single clip
curl -H "X-API-Key: eg_your_api_key_here" \
  "https://your-project.supabase.co/functions/v1/public-api/clips/clip-uuid-here"

# Search clips
curl -H "X-API-Key: eg_your_api_key_here" \
  "https://your-project.supabase.co/functions/v1/public-api/search?q=voice%20note"
```

---

## Support

For API support, please contact:
- Email: api@echogarden.com
- Documentation: https://docs.echogarden.com/api
- GitHub Issues: https://github.com/echogarden/issues

---

## Changelog

### Version 1.0.0 (2024-01-01)
- Initial API release
- Clips, Profiles, Topics endpoints
- Search functionality
- Webhooks support
- Embed functionality

