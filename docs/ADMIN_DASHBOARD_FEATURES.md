# Admin Dashboard - Complete Feature List

This document describes all the features available in the admin dashboard.

## 📍 How to Access

1. **Navigate to** `/admin` in your app
   - Example: `http://localhost:5173/admin` (local)
   - Example: `https://yourdomain.com/admin` (production)

2. **You must be an admin** - See `ADMIN_SETUP_GUIDE.md` for setup instructions

## 🔐 Security

- Only users in the `admins` table can access the dashboard
- All actions are logged to security audit logs
- Admin access is verified on every request
- Unauthorized access attempts are logged

## 📊 Available Features

### 1. Security Metrics Dashboard

**Location**: Top of dashboard (toggle with "Show/Hide Metrics" button)

**Metrics Displayed**:
- **Critical Events (24h)**: Number of critical security events in last 24 hours
- **Error Events (24h)**: Number of error events in last 24 hours
- **Total Banned**: Total number of banned profiles
- **Recently Banned (24h)**: Profiles banned in last 24 hours
- **Suspicious Devices**: Number of suspicious devices
- **Revoked Devices**: Number of revoked devices

**Auto-refresh**: Every 30 seconds

### 2. Moderation Queue

**Location**: Main content area

**Features**:
- **AI Flags**: Clips flagged by AI moderation
  - Shows risk score, reasons, source
  - Actions: Approve, Hide, Remove
  - Priority sorting by risk score
- **Community Reports**: Clips reported by users
  - Shows reporter info, reason, details
  - Actions: Hide clip, Remove, Mark safe
  - Priority sorting by age

**Sorting Options**:
- Priority (Risk) - Highest risk first
- Newest First - Most recent first
- Oldest First - Oldest first

**Bulk Actions**:
- Select multiple items with checkboxes
- Bulk approve, hide, or remove
- Select all / Deselect all

### 3. User Management (Coming Soon)

**Available via API**:
- View all users
- Search users by handle
- View user details:
  - Profile information
  - User clips
  - User reports
  - Security audit logs
  - Ban history
- Ban/Unban users
- View user activity

**API Endpoints**:
- `getAllUsers` - Get all users with pagination
- `getUserDetails` - Get detailed user information

### 4. Reports Management (Coming Soon)

**Available via API**:
- View all reports
- Filter by status (all, open, reviewed, actioned)
- View report details:
  - Reported clip
  - Reporter information
  - Reason and details
  - Status
- Bulk actions on reports

**API Endpoints**:
- `getAllReports` - Get all reports with pagination
- Filter by status

### 5. Clips Management (Coming Soon)

**Available via API**:
- View all clips
- Filter by status (all, live, hidden, removed)
- Search clips by title or captions
- View clip details
- Bulk actions on clips

**API Endpoints**:
- `getAllClips` - Get all clips with pagination
- Filter by status and search

### 6. System Stats (Coming Soon)

**Available via API**:
- Total users
- Total clips
- Total reports
- Banned users
- Clips by status
- Reports by status

**API Endpoints**:
- `getSystemStats` - Get system statistics

## 🔧 API Actions Available

### Moderation Actions

1. **list** - Get moderation queue
   - Parameters: `sortBy` (priority, newest, oldest)
   - Returns: flags, reports

2. **getMetrics** - Get abuse metrics
   - Returns: security metrics, moderation metrics

3. **updateClip** - Update clip status
   - Parameters: `clipId`, `status`, `flagId`, `reportIds`
   - Actions: Approve (live), Hide (hidden), Remove (removed)

4. **bulkUpdateClips** - Bulk update clips
   - Parameters: `clipIds`, `status`, `flagIds`, `reportIds`
   - Actions: Bulk approve, hide, or remove

5. **resolveReport** - Resolve a report
   - Parameters: `reportId`
   - Action: Mark report as reviewed

### User Management Actions

6. **getAllUsers** - Get all users
   - Parameters: `limit`, `offset`, `search`
   - Returns: users, totalCount

7. **getUserDetails** - Get user details
   - Parameters: `profileId`
   - Returns: profile, clips, reports, auditLogs, banHistory

### Reports Management Actions

8. **getAllReports** - Get all reports
   - Parameters: `limit`, `offset`, `status`
   - Returns: reports, totalCount

### Clips Management Actions

9. **getAllClips** - Get all clips
   - Parameters: `limit`, `offset`, `status`, `search`
   - Returns: clips, totalCount

### System Stats Actions

10. **getSystemStats** - Get system statistics
    - Returns: totalUsers, totalClips, totalReports, bannedUsers, clipsByStatus, reportsByStatus

## 📝 Usage Examples

### Get All Users

```typescript
const { data, error } = await supabase.functions.invoke("admin-review", {
  body: {
    action: "getAllUsers",
    limit: 50,
    offset: 0,
    search: "john",
  },
  headers: { "x-device-id": deviceId },
});
```

### Get User Details

```typescript
const { data, error } = await supabase.functions.invoke("admin-review", {
  body: {
    action: "getUserDetails",
    profileId: "user-profile-id",
  },
  headers: { "x-device-id": deviceId },
});
```

### Get All Reports

```typescript
const { data, error } = await supabase.functions.invoke("admin-review", {
  body: {
    action: "getAllReports",
    limit: 50,
    offset: 0,
    status: "open", // or "all", "reviewed", "actioned"
  },
  headers: { "x-device-id": deviceId },
});
```

### Get All Clips

```typescript
const { data, error } = await supabase.functions.invoke("admin-review", {
  body: {
    action: "getAllClips",
    limit: 50,
    offset: 0,
    status: "live", // or "all", "hidden", "removed"
    search: "search term",
  },
  headers: { "x-device-id": deviceId },
});
```

### Get System Stats

```typescript
const { data, error } = await supabase.functions.invoke("admin-review", {
  body: {
    action: "getSystemStats",
  },
  headers: { "x-device-id": deviceId },
});
```

## 🎯 Next Steps

To add the UI for these features:

1. **Add Tabs Component** - Use the existing Tabs component
2. **Create User Management Tab** - Display users, search, pagination
3. **Create Reports Management Tab** - Display all reports, filter by status
4. **Create Clips Management Tab** - Display all clips, filter by status, search
5. **Create System Stats Tab** - Display system statistics

## 🔒 Security Notes

- All admin actions are logged
- Admin access is verified on every request
- Unauthorized access attempts are logged
- All data is fetched securely through edge functions
- RLS policies protect sensitive data

## 📚 Related Documentation

- `ADMIN_SETUP_GUIDE.md` - How to set up admin access
- `SECURITY_INCIDENT_RESPONSE.md` - Security incident response procedures
- `SECURITY_IMPLEMENTATION_SUMMARY.md` - Security implementation summary

---

**Last Updated**: 2025-01-XX
**Version**: 1.0

