# Enhanced Discovery & Social Features Implementation Guide

## ✅ Completed

### Database Schema
- ✅ `clip_similarities` table for similarity scores
- ✅ `user_listening_patterns` table for ML recommendations
- ✅ `auto_playlists` and `auto_playlist_clips` for topic-based playlists
- ✅ `friends` table (separate from follows)
- ✅ `group_chats`, `group_chat_members`, `group_chat_messages` tables
- ✅ `playlist_collaborators` table
- ✅ `mentions` table for @username mentions
- ✅ Voice message threads support in DMs

### Database Functions
- ✅ `get_because_you_listened_to()` - Recommendations based on listening history
- ✅ `get_similar_voice_clips()` - Similar voice/style discovery
- ✅ `create_topic_auto_playlist()` - Auto-generate topic playlists
- ✅ `create_mention_notification()` - Trigger notifications for mentions

### Hooks
- ✅ `useEnhancedDiscovery.ts` - Hooks for "Because you listened to..." and similar voice clips
- ✅ `useFriends.ts` - Friends system hooks (send request, accept, remove)

## 🚧 In Progress

### Frontend Components
- 🔄 Update Discovery page with new recommendation sections
- 🔄 Friends UI components
- 🔄 Group chat components
- 🔄 Mentions UI in clip creation/editing
- 🔄 Collaborative playlist UI

## 📋 Remaining Tasks

### 1. Enhanced Discovery UI
- [ ] Add "Because you listened to..." section to Discovery page
- [ ] Add "Similar Voice/Style" section to clip detail pages
- [ ] Create auto-playlist UI component
- [ ] Add recommendation explanations/reasons

### 2. Friends System UI
- [ ] Friends list page
- [ ] Friend request notifications
- [ ] Send friend request button on profiles
- [ ] Friends vs Follows distinction in UI

### 3. Group Chats
- [ ] Group chat list page
- [ ] Create group chat UI
- [ ] Group chat room component (voice + text)
- [ ] Group chat member management

### 4. Collaborative Playlists
- [ ] Add collaborator UI to playlist settings
- [ ] Invite collaborators functionality
- [ ] Show collaborator avatars on playlists
- [ ] Permission management (owner/editor/collaborator)

### 5. Mentions
- [ ] @mention autocomplete in clip creation
- [ ] @mention autocomplete in comments
- [ ] Mention notifications UI
- [ ] Click mention to navigate to profile

### 6. Voice Message Threads in DMs
- [ ] Thread UI in DirectMessages
- [ ] Reply to message functionality
- [ ] Thread navigation

## 🎯 Implementation Priority

1. **High Priority** (User-facing, high impact):
   - "Because you listened to..." recommendations in Discovery
   - Friends system UI
   - Mentions in clips

2. **Medium Priority**:
   - Similar voice/style discovery
   - Group chats
   - Collaborative playlists

3. **Lower Priority** (Nice to have):
   - Auto-playlists UI
   - Voice message threads enhancement

## 📝 Usage Examples

### Using Enhanced Discovery Hooks

```tsx
import { useBecauseYouListenedTo, useSimilarVoiceClips } from '@/hooks/useEnhancedDiscovery';

// In a component
const { data: recommendations, isLoading } = useBecauseYouListenedTo(10);
const { data: similarClips } = useSimilarVoiceClips(clipId, 10);
```

### Using Friends Hooks

```tsx
import { useFriends, useSendFriendRequest, useAcceptFriendRequest } from '@/hooks/useFriends';

// Get friends list
const { data: friends } = useFriends('accepted');
const { data: pendingRequests } = useFriends('pending');

// Send friend request
const sendRequest = useSendFriendRequest();
sendRequest.mutate(profileId);

// Accept friend request
const acceptRequest = useAcceptFriendRequest();
acceptRequest.mutate(requestId);
```

## 🔧 Database Functions Usage

### Get "Because you listened to..." recommendations
```sql
SELECT * FROM get_because_you_listened_to('user-id', 10);
```

### Get similar voice clips
```sql
SELECT * FROM get_similar_voice_clips('clip-id', 10);
```

### Create topic auto-playlist
```sql
SELECT create_topic_auto_playlist('user-id', 'topic-id', 50);
```

## 📊 Data Flow

### Recommendations Flow
1. User listens to clips → `listens` table
2. System calculates similarity → `clip_similarities` table
3. User opens Discovery → `get_because_you_listened_to()` function
4. Returns clips with similarity scores and reasons

### Friends Flow
1. User sends friend request → `friends` table (status: 'pending')
2. Recipient gets notification
3. Recipient accepts → `friends` table (status: 'accepted')
4. Both users can see each other as friends

### Mentions Flow
1. User types @username in clip/comment
2. System creates mention → `mentions` table
3. Trigger creates notification → `notifications` table
4. Mentioned user sees notification

## 🚀 Next Steps

1. Update Discovery page to show new recommendation sections
2. Create Friends page/component
3. Add mentions UI to clip creation
4. Create group chat components
5. Add collaborative playlist features

