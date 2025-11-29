# Security & Anti-Abuse TODO List 🔒

This document lists security vulnerabilities and abuse vectors that need to be fixed to prevent users from exploiting the system.

## 🔴 CRITICAL - Fix Immediately

### 1. **Username/Handle Duplicate Prevention** ⚠️
**Issue**: While database has UNIQUE constraint on `handle`, need to verify enforcement everywhere
- [x] Verify UNIQUE constraint is enforced in database (`profiles.handle UNIQUE NOT NULL`)
- [x] Add application-level validation before allowing handle selection
- [x] Check that error handling properly catches duplicate handle attempts in OnboardingFlow
- [x] Add case-insensitive username matching (e.g., "User123" should conflict with "user123")
- [x] Add reserved usernames list (admin, mod, support, etc.)
- [x] Prevent usernames that impersonate official accounts

**Files to check:**
- `src/components/OnboardingFlow.tsx`
- `supabase/migrations/20251110152310_1abfdca7-00a1-4420-b7ed-c6bcc588681a.sql`
- `src/lib/validation.ts` (handleSchema)

---

### 2. **Multiple Account Creation Prevention** 🚨
**Issue**: Users can create unlimited accounts by clearing localStorage and getting new device_id
- [x] Implement IP-based rate limiting for profile creation (max 3 accounts per IP per 24 hours)
- [x] Add device fingerprinting to detect same browser creating multiple accounts
- [x] Implement account creation cooldown per IP address (e.g., 1 account per hour)
- [x] Track and flag suspicious account creation patterns (multiple accounts from same IP quickly)
- [ ] Add CAPTCHA or proof-of-work challenge for account creation (TODO: Integrate CAPTCHA service)
- [x] Detect and prevent automated account creation (bot detection)
- [x] Limit device_id generation to prevent easy manipulation
- [x] Add server-side validation that device_id format is valid UUID

**Files to modify:**
- `src/components/OnboardingFlow.tsx`
- `src/hooks/useProfile.ts`
- Create new migration: `supabase/migrations/[timestamp]_add_account_creation_limits.sql`
- Edge function for account creation validation

---

### 3. **Clip Upload Rate Limiting** 🚨
**Issue**: No rate limiting on clip creation/upload - users can spam content
- [x] Add rate limiting: Max 10 clips per hour per profile
- [x] Add daily limit: Max 50 clips per day per profile
- [x] Add IP-based rate limiting: Max 20 clips per hour per IP
- [x] Implement upload queue limits (max 5 pending uploads)
- [x] Add cooldown period after uploading (e.g., 30 seconds between uploads)
- [x] Track and flag accounts uploading suspicious amounts of content

**Files to modify:**
- `supabase/functions/on-clip-uploaded/index.ts` (add rate limiting)
- `src/context/UploadQueueContext.tsx` (add queue limits)
- Create edge function wrapper for upload validation

---

## 🟠 HIGH PRIORITY - Fix Soon

### 4. **Bot Detection & Prevention** 🤖
**Issue**: Limited bot detection, easy to bypass
- [x] Enhance device fingerprinting (canvas, WebGL, audio context fingerprints)
- [x] Detect automation tools (Selenium, Puppeteer, headless browsers)
- [x] Track behavioral patterns (too fast interactions, perfect timing, etc.)
- [ ] Implement CAPTCHA for suspicious activities (TODO: Integrate CAPTCHA service like hCaptcha or reCAPTCHA)
- [x] Add rate limiting based on user behavior patterns
- [x] Detect and block known bot user-agents
- [x] Implement honeypot fields in forms ✅ (Added to OnboardingFlow)
- [ ] Add proof-of-human verification for high-value actions (TODO: Integrate challenge system)

**Implementation Notes (Honeypot):**
- Hidden honeypot field added to `OnboardingFlow` component
- Field is positioned off-screen with `aria-hidden="true"` and `tabIndex={-1}`
- Validation in `validate-account-creation` edge function checks if honeypot is filled
- If honeypot field has a value, request is rejected as likely bot activity
- Legitimate users won't see or interact with the field

**Files to modify:**
- `src/lib/deviceSecurity.ts` (enhance detection)
- Create new edge function: `supabase/functions/detect-bot/index.ts`

---

### 5. **Reaction Spam Prevention** 💬
**Issue**: Rate limits are per-minute, users can still spam reactions
- [x] Reduce reaction rate limits ✅ (reduced to 10/min for clip reactions, 10/min for comment reactions, 5/min for voice reactions)
- [x] Add per-clip reaction cooldown ✅ (2 seconds cooldown between reactions)
- [x] Implement daily reaction limits ✅ (max 500 reactions per day for clip reactions, 500 for comment reactions, 200 for voice reactions)
- [x] Add IP-based rate limiting for reactions ✅ (50/min for clip reactions, 50/min for comment reactions, 20/min for voice reactions)
- [x] Detect and prevent automated reaction patterns ✅ (reputation farming checks prevent same user giving multiple reactions)
- [x] Add cooldown after reacting ✅ (2 seconds between reactions)

**Implementation Notes:**
- `react-to-clip`: 10/min per profile, 500/day, 50/min per IP, 2s cooldown, reputation farming check
- `react-to-comment`: 10/min per profile, 500/day, 50/min per IP, 2s cooldown, reputation farming check
- `add-voice-reaction`: 5/min per profile, 200/day, 20/min per IP, 2s cooldown, reputation farming check
- All reaction functions include IP tracking and logging

**Files modified:**
- `supabase/functions/react-to-clip/index.ts` ✅
- `supabase/functions/react-to-comment/index.ts` ✅
- `supabase/functions/add-voice-reaction/index.ts` ✅

---

### 6. **Listen Count Manipulation** 📊
**Issue**: Users can inflate listen counts by repeatedly calling increment-listen
- [x] Add stronger throttling ✅ (increased to 30 seconds between listens for same clip)
- [x] Implement daily listen limit per clip per profile ✅ (max 10 listens per clip per day)
- [x] Add IP-based rate limiting for listen tracking ✅ (200 listens per minute per IP)
- [x] Validate that listen duration is reasonable ✅ (minimum 1 second required, max 3600 seconds)
- [x] Detect suspicious listen patterns ✅ (reputation farming checks prevent same user giving multiple listens)
- [x] Add server-side validation that clip was actually played ✅ (minimum 1 second duration check)

**Implementation Notes:**
- Throttling: 30 seconds between listens for the same clip (increased from 5 seconds)
- Daily limit: Max 10 listens per clip per profile per day
- IP rate limiting: 200 listens per minute per IP address
- Duration validation: Must be between 1 and 3600 seconds (1 hour max)
- Reputation farming check: 60-minute cooldown prevents same user from inflating listens
- All listens are logged with IP address for abuse detection

**Files modified:**
- `supabase/functions/increment-listen/index.ts` ✅

---

### 7. **Comment Spam Prevention** 💬
**Issue**: Limited rate limiting on comments
- [x] Add per-clip comment limits (max 5 comments per clip per profile)
- [x] Implement daily comment limits (max 50 comments per day)
- [x] Add comment length validation (min 1 char, max reasonable length)
- [x] Add cooldown period between comments (e.g., 10 seconds)
- [x] Detect and prevent duplicate/similar comments
- [x] Add content moderation for spam keywords

**Files to modify:**
- `supabase/functions/add-voice-comment/index.ts` (currently 5/min)

---

### 8. **Content Validation** 📝
**Issue**: Limited validation on user-generated content
- [x] Add audio file size limits (max 10MB per clip)
- [x] Validate audio duration (must match metadata)
- [x] Add content filtering for titles/descriptions (profanity, spam)
- [x] Validate tags (max 10 tags, reasonable length)
- [x] Prevent duplicate content uploads (same audio file)
- [x] Add audio quality validation (not just silence/static) - ✅ Fully implemented with comprehensive checks
- [x] Validate metadata matches actual audio file - ✅ Fully implemented with duration and file size validation

**Files to modify:**
- `src/components/RecordModal.tsx` - Client-side validation still needed
- `supabase/functions/on-clip-uploaded/index.ts` - ✅ Server-side validation added
- Storage policies for audio bucket

---

### 9. **Device ID Manipulation** 🆔
**Issue**: Device IDs are generated client-side and easy to manipulate
- [x] Add server-side device ID validation (format, uniqueness)
- [x] Track device ID changes and flag suspicious switches
- [x] Implement device ID rotation limits (max 3 device IDs per profile per day)
- [x] Add device ID blacklist for banned devices
- [x] Validate device ID hasn't been recently used by another account
- [x] Add device fingerprint binding to prevent easy ID swapping

**Files to modify:**
- `src/integrations/supabase/client.ts` - ✅ Updated with validation and tracking
- `src/lib/deviceSecurity.ts` - ✅ Enhanced with fingerprint binding
- Database migration for device tracking - ✅ Created: `20251209000002_add_device_id_tracking.sql`

---

### 10. **API Key Abuse Prevention** 🔑
**Issue**: API keys can be abused for automated scraping/botting
- [x] Reduce default API rate limits (reduced from 60/min to 20/min for public API)
- [x] Implement stricter rate limiting per IP when API key is used (max 50/min per IP)
- [x] Add daily quota limits per API key
- [x] Monitor and flag suspicious API usage patterns (IP diversity tracking, automatic flagging)
- [x] Add request size limits for API endpoints (10MB max)
- [x] Implement API key rotation requirements (90-day default, tracking and warnings)
- [x] Add webhook delivery rate limiting (50/min per webhook, reduced from 100/min)

**Files to modify:**
- `supabase/functions/public-api/index.ts` ✅ Updated with all security enhancements
- `supabase/migrations/20251213000000_enhance_api_key_security.sql` ✅ New migration for rotation and suspicious usage tracking
- `supabase/migrations/20251209000000_add_security_enhancements.sql` ✅ Updated webhook rate limit

---

## 🟡 MEDIUM PRIORITY

### 11. **Profile Update Abuse** 👤
**Issue**: Users can spam profile updates (handle changes limited to 7 days, but other fields not limited)
- [x] Add rate limiting on profile updates (max 5 updates per hour)
- [x] Validate emoji avatar is a single valid emoji
- [x] Prevent rapid handle changes (already has 7-day limit, but verify enforcement)
- [x] Add cooldown on bio/preferences updates

**Files to check:**
- `supabase/migrations/20251110183000_settings_preferences.sql` (change_pseudonym function)
- `supabase/migrations/20251209000000_add_security_enhancements.sql` (update_profile_with_rate_limit function)
- `src/hooks/useProfile.ts` (updated to use rate-limited function)

---

### 12. **Storage Abuse** 💾
**Issue**: Users can upload unlimited audio files, causing storage costs
- [x] Implement per-user storage quotas (e.g., 100MB per profile)
- [x] Add cleanup of old/unused clips after 90 days
- [x] Limit clip retention for accounts with no activity
- [x] Add storage usage tracking per profile
- [x] Implement automatic deletion of failed/processing clips after 24 hours

**Files to modify:**
- `supabase/migrations/20251209000000_add_security_enhancements.sql` (storage quota functions)
- `supabase/migrations/20251213000000_add_medium_priority_security_enhancements.sql` (inactive account cleanup)
- `supabase/functions/on-clip-uploaded/index.ts` (storage quota checking)
- `supabase/functions/cleanup-storage/index.ts` (cleanup cron job)

---

### 13. **Community Creation Spam** 👥
**Issue**: Users can create unlimited communities
- [x] Add rate limiting: Max 1 community per day per profile
- [x] Require minimum account age (e.g., 7 days old) to create communities
- [x] Add IP-based rate limiting for community creation
- [x] Validate community name/slug uniqueness (case-insensitive)
- [x] Add reserved community names list

**Files to modify:**
- `supabase/migrations/20250110000000_add_abuse_prevention_rate_limiting.sql` (can_create_community function)
- `supabase/migrations/20251213000000_add_medium_priority_security_enhancements.sql` (IP-based rate limiting, logging)
- `src/hooks/useCommunity.ts` (useCreateCommunity) - already uses can_create_community
- `src/components/CreateCommunityModal.tsx` - already uses validation

---

### 14. **Live Room Abuse** 🎤
**Issue**: Users can create unlimited live rooms
- [x] Add rate limiting: Max 3 live rooms per day per profile
- [x] Implement concurrent room limits (max 1 active room per profile)
- [x] Add room duration limits (max 2 hours per room)
- [x] Validate room participant limits are reasonable
- [x] Add cooldown between room creation (e.g., 1 hour)

**Files to modify:**
- `supabase/migrations/20250110000000_add_abuse_prevention_rate_limiting.sql` (can_create_live_room function)
- `supabase/migrations/20251213000000_add_medium_priority_security_enhancements.sql` (duration limits, auto-end function)
- `src/hooks/useLiveRooms.ts` (updated to support max_duration_minutes)
- `src/components/CreateRoomModal.tsx` - can be enhanced to allow duration selection

---

### 15. **Follow/Unfollow Spam** 🔔
**Issue**: Users can rapidly follow/unfollow to manipulate metrics
- [x] Add rate limiting: Max 200 follows per hour per profile (lenient for popular creators)
- [x] Implement cooldown between follow actions (1 second - minimal to prevent rapid clicking)
- [x] Detect and prevent follow/unfollow churn (same profile repeatedly) ✅
  - [x] Create audit log table to track all follow/unfollow actions with timestamps ✅
  - [x] Log every follow/unfollow action (profile_id, target_profile_id, action_type, timestamp) ✅
  - [x] Detect churn patterns: same profile following/unfollowing same target multiple times within short period ✅
  - [x] Add threshold detection (e.g., follow/unfollow same profile more than 3 times in 24 hours) ✅
  - [x] Implement automatic temporary restriction on churn behavior (cooldown period) ✅
  - [x] Flag accounts with excessive churn patterns for manual review ✅

**Implementation Notes:**
- Audit log table `follow_audit_log` tracks all follow/unfollow actions with IP and user agent
- Triggers automatically log all follow/unfollow actions
- `detect_follow_churn()` function detects churn patterns (3+ actions on same profile in 24 hours)
- `can_follow_profile()` function now checks for churn and enforces 24-hour cooldown if detected
- `get_profile_churn_stats()` function provides churn statistics for a profile
- `flag_churn_accounts_for_review()` function flags accounts with 5+ churn targets for admin review
- `churn_review_flags` table tracks accounts flagged for manual review
- Severity levels: none, low (1 target), medium (2-4), high (5-9), critical (10+)

**Files created:**
- `supabase/migrations/20251214000000_add_follow_churn_detection.sql` ✅

**Files to check:**
- `supabase/migrations/20250110000000_add_abuse_prevention_rate_limiting.sql` (can_follow_profile function - updated with churn detection)
- `src/hooks/useFollow.ts` (uses can_follow_profile function - no changes needed)

---

### 16. **Scheduled Post Abuse** ⏰
**Issue**: Users can schedule unlimited posts
- [x] Add limits: Max 50 scheduled posts per profile ✅
- [x] Add rate limiting on scheduling (max 10 scheduled posts per hour) ✅
- [x] Validate scheduled times are in the future and reasonable (not 100 years ahead) ✅
- [x] Add maximum scheduling horizon (e.g., 30 days ahead) ✅

**Implementation Notes:**
- `can_schedule_post()` function enforces all limits and validations:
  - Max 50 scheduled posts per profile (draft status, scheduled_for > NOW())
  - Max 10 scheduled posts per hour
  - Scheduled time must be in the future
  - Maximum scheduling horizon: 30 days ahead
  - Validates not more than 100 years in the future
- `RecordModal.tsx` calls `can_schedule_post` before scheduling new posts
- `MyRecordings.tsx` calls `can_schedule_post` when editing scheduled times

**Files modified:**
- `supabase/migrations/20250110000000_add_abuse_prevention_rate_limiting.sql` (can_schedule_post function) ✅
- `src/components/RecordModal.tsx` ✅ (validates before scheduling)
- `src/pages/MyRecordings.tsx` ✅ (validates when editing scheduled times)

---

## 🟢 LOW PRIORITY - Nice to Have

### 17. **IP-Based Abuse Detection** 🌐
- [x] Track IP addresses for all actions ✅
- [x] Flag IPs with suspicious activity patterns ✅
- [x] Implement IP-based rate limiting for all endpoints ✅
- [x] Add IP blacklist for known abuse sources ✅
- [x] Detect VPN/proxy usage and add extra validation ✅

**Implementation Notes:**
- IP tracking added to: `add-voice-comment`, `add-voice-reaction`, `react-to-comment`, `add-comment-voice-reaction`, `on-clip-uploaded`, `react-to-clip`, `increment-listen`
- IP-based rate limiting implemented using `check_ip_rate_limit()` function
- Suspicious IP pattern detection via `detect_suspicious_ip_pattern()` function
- VPN/proxy detection function added (basic heuristic - can be enhanced with external service)
- IP blacklist checking via `is_ip_blacklisted()` function

---

### 18. **Content Quality Enforcement** ⭐
- [x] Prevent uploading empty/silent audio clips ✅ (via `check_audio_quality()` function)
- [x] Validate minimum audio quality (not just noise) ✅ (quality score validation)
- [x] Add automatic detection of low-quality content ✅ (flags for review)
- [x] Implement content review queue for flagged content ✅

**Implementation Notes:**
- Audio quality checks in `on-clip-uploaded` function prevent empty/silent clips
- Quality validation checks bytes/second ratio and quality scores
- Low-quality content automatically flagged for review in `content_review_queue` table
- Invalid content (empty/silent) is automatically rejected and removed

---

### 19. **Reputation System Abuse** 🏆
- [x] Prevent reputation farming (fake interactions to boost karma) ✅
- [x] Add cooldown on reputation gain actions ✅
- [x] Validate reputation calculations are correct (validation functions created) ✅
- [x] Detect suspicious reputation patterns ✅

**Implementation Notes:**
- Reputation farming checks added to: `react-to-clip`, `increment-listen`, `add-voice-reaction`, `react-to-comment`, `add-comment-voice-reaction`
- Cooldown enforcement via `check_reputation_farming()` function (60-minute cooldown per source user)
- All reputation actions logged in `reputation_action_logs` table
- Suspicious pattern detection via `detect_suspicious_reputation_pattern()` function
- Reputation calculations validated through database triggers and functions

**Files to check:**
- Reputation/karma system migrations: `20251112000000_add_reputation_karma.sql`, `20251130000000_enhance_gamification.sql`
- Security functions: `supabase/functions/_shared/security.ts`
- Edge functions with reputation checks: `react-to-clip`, `increment-listen`, `add-voice-reaction`, `react-to-comment`, `add-comment-voice-reaction`

**Validation Functions Created:**
- `validate_profile_reputation()` - Validates single profile
- `validate_all_reputation_calculations()` - Batch validation with summary
- `get_reputation_breakdown()` - Detailed breakdown for debugging
- `fix_profile_reputation()` - Auto-fix discrepancies (use with caution)

**Validation Guide:**
- See `REPUTATION_VALIDATION_GUIDE.md` for complete manual review instructions

**Migration:**
- `supabase/migrations/20251215000004_validate_reputation_calculations.sql` ✅

---

### 20. **Email/Digest Abuse** 📧
- [ ] Validate email addresses are real (not disposable email services)
- [ ] Add rate limiting on email digest requests
- [ ] Prevent email spam through digest subscriptions
- [ ] Add unsubscribe validation

**Files to check:**
- Daily digest functionality

---

## ✅ Automatic Validation & Audit Logging

**All validations and audit logging are now automatic via database triggers!**

- ✅ Scheduled post validation runs automatically on INSERT/UPDATE
- ✅ Follow action validation runs automatically on INSERT
- ✅ Community creation validation runs automatically on INSERT
- ✅ Live room creation validation runs automatically on INSERT
- ✅ All follow/unfollow actions are automatically logged
- ✅ All account creations are automatically logged
- ✅ All clip uploads are automatically logged
- ✅ All IP activity is automatically logged

**See**: `AUTOMATIC_VALIDATION_SUMMARY.md` for complete details

**Migration**: `20251215000000_add_automatic_validation_triggers.sql`

## 📋 Implementation Priority

1. **Week 1**: Critical issues (#1, #2, #3)
2. **Week 2**: High priority (#4, #5, #6, #7)
3. **Week 3**: High priority continued (#8, #9, #10)
4. **Week 4**: Medium priority (#11-16)
5. **Ongoing**: Low priority (#17-20)

---

## 🔍 Additional Security Measures to Consider

- [x] Implement database query rate limiting (prevent expensive queries) ✅
- [x] Add request signing to prevent replay attacks ✅
- [x] Implement CSRF protection for state-changing operations ✅
- [x] Add XSS protection in all user-generated content ✅
- [x] Implement SQL injection prevention (verify all queries use parameterization) ✅
- [x] Add audit logging for all security-sensitive operations ✅
- [x] Create admin dashboard for monitoring abuse patterns (Admin dashboard exists, enhancement pending) ✅
- [x] Implement automated ban system for repeat offenders ✅
- [x] Add content moderation queue enhancements: ✅
  - [x] Add filtering by risk level, source (ai/community), type (clip/profile), and reason ✅
  - [x] Add search functionality within moderation queue ✅
  - [x] Add admin assignment tracking (who is reviewing which item) ✅
  - [x] Add moderation notes/comments field for decisions ✅
  - [x] Add workflow states (pending → in_review → resolved/actioned) ✅
  - [x] Add auto-escalation for items older than 24 hours (increase priority) ✅
  - [x] Add profile actions for profile reports (ban, warn, dismiss) ✅
  - [x] Add moderation history/audit trail per item ✅
  - [x] Add notifications for new high-risk items ✅
  - [x] Add statistics dashboard (items reviewed per day, average time to review, etc.) ✅
- [x] Create security incident response procedures ✅

---

## 📝 Notes

- All rate limits should be configurable per environment (dev/staging/prod)
- Rate limiting should use Redis or database-backed storage (not in-memory)
- All security functions should have proper error handling
- Security measures should not significantly impact legitimate user experience
- Consider implementing progressive restrictions (warnings → rate limits → temporary bans → permanent bans)

---

**Last Updated**: 2025-01-XX
**Status**: In Progress

