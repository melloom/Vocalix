# Community & Moderation Features Implementation

This document summarizes the implementation of Priority 6: Community & Moderation features to match Reddit.

## ✅ Completed Features

### 1. Enhanced Community Moderation

#### Database Schema
- **`community_auto_mod_rules`** - Auto-moderation rules table with support for:
  - Keyword-based rules
  - Spam pattern detection
  - User behavior rules
  - Content analysis rules
  - Rate limiting rules
  - Configurable actions (remove, hide, flag, warn, ban)

- **`community_moderation_queue`** - Community-specific moderation queue with:
  - Workflow states (pending, in_review, resolved, actioned)
  - Priority scoring
  - Assignment tracking
  - Moderation notes
  - Auto-flagging support

- **`community_moderation_analytics`** - Analytics tracking for:
  - Items reviewed per day
  - Items removed/approved
  - Average response time
  - Reports received
  - Auto-mod actions

#### Frontend Components
- **`CommunityModerationTools`** - Main moderation dashboard
- **`AutoModRulesManager`** - Create and manage auto-moderation rules
- **`ModerationQueue`** - Review and take action on reported content
- **`ModerationAnalytics`** - View moderation statistics and insights

### 2. Community Customization

#### Database Schema
- **`communities.theme_config`** - JSONB field for custom themes (colors, background images)
- **`community_rules`** - Custom community rules with numbering
- **`community_flairs`** - User flairs/badges with:
  - Custom emoji
  - Text and background colors
  - User-assignable option
- **`community_user_flairs`** - User flair assignments
- **`community_events`** - Events calendar with:
  - Start/end dates
  - Location support
  - Recurring events

#### Frontend Components
- **`CommunityCustomization`** - Main customization interface
- **`CommunityRulesManager`** - Create and manage community rules
- **`CommunityFlairsManager`** - Create and manage user flairs
- **`CommunityEventsManager`** - Create and manage community events

### 3. Community Discovery

#### Database Schema
- **`communities.category`** - Community category
- **`communities.subcategory`** - Community subcategory
- **`communities.tags`** - Array of tags for discovery
- **`community_activity`** - Activity feed tracking:
  - Clip posts
  - Member joins
  - Event creation
  - Announcements
  - Rule updates
- **`community_similarities`** - Similar communities tracking with similarity scores

#### Helper Functions
- **`get_similar_communities()`** - Get similar communities based on tags and members
- **`compute_community_similarities()`** - Compute similarity scores between communities
- **`log_community_activity()`** - Log community activity events

### 4. AI-Powered Moderation

#### Database Schema
- **`ai_moderation_results`** - AI analysis results with:
  - Spam score (0-1)
  - Harassment score (0-1)
  - Toxicity score (0-1)
  - Overall risk score (0-10)
  - Detected issues array
  - Moderation suggestions array

#### Edge Function
- **`ai-moderation`** - Edge function that:
  - Analyzes content for spam, harassment, and toxicity
  - Uses OpenAI moderation API for toxicity detection
  - Stores results in `ai_moderation_results` table
  - Auto-flags high-risk content via database trigger

#### Auto-Flagging
- Database trigger automatically creates moderation flags when AI detects high-risk content (risk >= 7)
- Supports both community moderation queue and global moderation queue

### 5. Enhanced User Reporting

#### Database Schema Enhancements
- **`reports.category`** - Main report category
- **`reports.subcategory`** - More specific subcategory
- **`reports.report_metadata`** - Additional metadata (JSONB)
- **`reports.response_time_minutes`** - Calculated response time
- **`reports.community_id`** - Link to community if applicable
- **`report_feedback`** - User feedback on moderation actions:
  - Satisfaction scores (1-5)
  - Feedback comments
  - Appeal support

#### Frontend Components
- **`EnhancedReportDialog`** - Improved reporting UI with:
  - Category and subcategory selection
  - Better UX with detailed descriptions
  - Support for clips, profiles, and comments
  - Community context support

#### Features
- Automatic response time calculation when reports are resolved
- User feedback collection on moderation actions
- Report tracking and status updates

## 📁 Files Created

### Database Migrations
- `supabase/migrations/20250215000000_enhance_community_moderation_features.sql`

### Edge Functions
- `supabase/functions/ai-moderation/index.ts`

### Frontend Components
- `src/components/EnhancedReportDialog.tsx`
- `src/components/CommunityModerationTools.tsx`
- `src/components/AutoModRulesManager.tsx`
- `src/components/ModerationQueue.tsx`
- `src/components/ModerationAnalytics.tsx`
- `src/components/CommunityCustomization.tsx`
- `src/components/CommunityRulesManager.tsx`
- `src/components/CommunityFlairsManager.tsx`
- `src/components/CommunityEventsManager.tsx`

## 🔧 Integration Notes

### To Use Enhanced Reporting
Replace existing `ReportClipDialog` and `ReportProfileDialog` with `EnhancedReportDialog`:

```tsx
<EnhancedReportDialog
  contentType="clip"
  contentId={clipId}
  contentTitle={clipTitle}
  communityId={communityId}
  trigger={<Button>Report</Button>}
/>
```

### To Add Moderation Tools to Community Page
Add to `CommunityDetail.tsx`:

```tsx
import { CommunityModerationTools } from "@/components/CommunityModerationTools";

// In the component, add:
{isHost || isModerator ? (
  <CommunityModerationTools
    communityId={communityId}
    isHost={isHost}
    canModerate={isHost || isModerator}
  />
) : null}
```

### To Add Customization Tools
Add to `CommunityDetail.tsx`:

```tsx
import { CommunityCustomization } from "@/components/CommunityCustomization";

// In the component, add:
{isHost ? (
  <CommunityCustomization
    communityId={communityId}
    isHost={isHost}
    canModerate={isHost}
  />
) : null}
```

## 🚀 Next Steps

1. **Run the migration** to create all database tables and functions
2. **Deploy the edge function** `ai-moderation` to Supabase
3. **Integrate components** into existing community pages
4. **Set up cron jobs** for:
   - Computing community similarities (weekly)
   - Auto-escalating old moderation items (hourly)
   - Updating moderation analytics (daily)
5. **Configure AI moderation** by calling the edge function when content is uploaded
6. **Test all features** with sample data

## 📊 Database Functions Available

- `get_community_moderation_stats(community_id, start_date, end_date)` - Get moderation statistics
- `get_similar_communities(community_id, limit)` - Get similar communities
- `compute_community_similarities()` - Compute all community similarities
- `log_community_activity(community_id, activity_type, activity_data, profile_id)` - Log activity
- `auto_flag_based_on_ai_moderation()` - Trigger function for auto-flagging

## 🔐 Security

All tables have Row Level Security (RLS) policies:
- Community moderation tools are only accessible to hosts and moderators
- Community customization is only accessible to hosts
- Reports are viewable by admins and reporters
- AI moderation results are viewable by admins and moderators

## 📝 Notes

- The AI moderation function uses OpenAI's moderation API for toxicity detection
- Spam and harassment detection use pattern-based heuristics (can be enhanced with ML)
- Community similarities are computed based on tags, member overlap, and categories
- Auto-moderation rules support flexible JSONB configuration for different rule types
- All moderation actions are logged for audit purposes

