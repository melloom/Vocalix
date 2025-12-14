# Reputation Calculation Validation Guide

This guide helps you manually review and validate that reputation calculations are correct across the system.

## 📊 Understanding Reputation Calculation

### Base Reputation Formula
```
Base Reputation = Total Listens + Total Reactions
```

Where:
- **Total Listens**: Sum of `listens_count` from all `live` clips owned by the profile
- **Total Reactions**: Sum of all reaction counts from the `reactions` JSONB object for all `live` clips

### Enhanced Reputation (Karma) Formula
```
Enhanced Reputation = Base Reputation × Karma Multiplier
```

Where:
- **Karma Multiplier**: Based on user level
  - Level 1-5: 1.0x
  - Level 6-10: 1.1x
  - Level 11-20: 1.2x
  - Level 21-30: 1.3x
  - And so on...

## 🔍 Validation Functions

### 1. Validate Single Profile
```sql
-- Check a specific profile
SELECT * FROM public.validate_profile_reputation('profile-uuid-here');
```

**Returns:**
- `stored_reputation` vs `calculated_base_reputation`
- `stored_total_karma` vs `calculated_enhanced_reputation`
- `is_base_correct`, `is_enhanced_correct`, `is_karma_correct` flags
- `discrepancies` array with details

### 2. Validate All Profiles (Batch)
```sql
-- Check top 100 profiles
SELECT * FROM public.validate_all_reputation_calculations(100, 0, false);

-- Check only profiles with discrepancies
SELECT * FROM public.validate_all_reputation_calculations(100, 0, true);
```

**Returns:**
- List of profiles with validation results
- Summary row with:
  - `total_checked`
  - `total_incorrect`
  - `accuracy_percentage`
  - `incorrect_profiles` JSONB array

### 3. Get Detailed Breakdown
```sql
-- Get detailed breakdown for a profile
SELECT * FROM public.get_reputation_breakdown('profile-uuid-here');
```

**Returns:**
- Total listens and reactions
- Base reputation calculation
- User level and karma multiplier
- Enhanced reputation calculation
- Per-clip breakdown (top 20 clips)
- Validation status

### 4. Fix Discrepancies (Use with Caution!)
```sql
-- Preview what would be fixed (DRY RUN)
SELECT * FROM public.fix_profile_reputation('profile-uuid-here', true);

-- Actually fix the discrepancies
SELECT * FROM public.fix_profile_reputation('profile-uuid-here', false);
```

## 📋 Manual Review Checklist

### Step 1: Run Batch Validation
```sql
-- Check top 1000 profiles
SELECT * FROM public.validate_all_reputation_calculations(1000, 0, true);
```

**Review:**
- ✅ Check `accuracy_percentage` - should be 100% or very close
- ✅ Review `incorrect_profiles` array
- ✅ Note any patterns in discrepancies

### Step 2: Investigate Discrepancies
For each profile with discrepancies:

1. **Get detailed breakdown:**
   ```sql
   SELECT * FROM public.get_reputation_breakdown('profile-uuid-here');
   ```

2. **Check the breakdown JSONB:**
   - Verify `listens_breakdown` matches actual clip listens
   - Verify `reactions_breakdown` matches actual reactions
   - Check `base_reputation_calculation` formula
   - Check `enhanced_reputation_calculation` formula
   - Review `top_clips` to see which clips contribute most

3. **Verify manually:**
   ```sql
   -- Check actual listens
   SELECT SUM(listens_count) as total_listens
   FROM public.clips
   WHERE profile_id = 'profile-uuid-here' AND status = 'live';
   
   -- Check actual reactions
   SELECT 
     SUM(
       (SELECT SUM((value::text)::INTEGER)
        FROM jsonb_each(reactions)
        WHERE (value::text)::INTEGER IS NOT NULL)
     ) as total_reactions
   FROM public.clips
   WHERE profile_id = 'profile-uuid-here' AND status = 'live';
   ```

### Step 3: Identify Root Causes

Common issues to check:

1. **Trigger not firing:**
   - Check if `trigger_update_reputation_on_clip_change` exists
   - Check if `trigger_update_reputation_on_reaction_change` exists
   - Check if `trigger_update_reputation_on_listen_change` exists

2. **Stale data:**
   - Reputation might not have been updated after bulk operations
   - Check `updated_at` timestamps on profiles

3. **Calculation logic changes:**
   - If calculation formula was changed, old data might be incorrect
   - Need to recalculate all profiles

4. **Data integrity issues:**
   - Clips with `status != 'live'` shouldn't count
   - Deleted clips might still be counted
   - Reactions might be in wrong format

### Step 4: Fix Issues

#### Option A: Fix Individual Profiles
```sql
-- Preview fix
SELECT * FROM public.fix_profile_reputation('profile-uuid-here', true);

-- Apply fix
SELECT * FROM public.fix_profile_reputation('profile-uuid-here', false);
```

#### Option B: Recalculate All Profiles
```sql
-- Recalculate all profiles
DO $$
DECLARE
  v_profile RECORD;
BEGIN
  FOR v_profile IN SELECT id FROM public.profiles LOOP
    PERFORM public.update_user_reputation(v_profile.id);
    
    -- Also update total_karma
    UPDATE public.profiles
    SET total_karma = public.calculate_enhanced_reputation(v_profile.id)
    WHERE id = v_profile.id;
  END LOOP;
END $$;
```

## 🎯 Validation Schedule

### Recommended: Weekly Validation
Run batch validation weekly to catch any discrepancies early:

```sql
-- Weekly check (top 100 profiles)
SELECT * FROM public.validate_all_reputation_calculations(100, 0, true);
```

### Monthly Deep Validation
Run full validation monthly:

```sql
-- Check all profiles in batches
SELECT * FROM public.validate_all_reputation_calculations(1000, 0, true);
SELECT * FROM public.validate_all_reputation_calculations(1000, 1000, true);
SELECT * FROM public.validate_all_reputation_calculations(1000, 2000, true);
-- ... continue until all profiles checked
```

## 📊 Expected Results

### Healthy System
- ✅ `accuracy_percentage` = 100%
- ✅ `total_incorrect` = 0
- ✅ All profiles show `is_karma_correct` = true

### Issues Detected
- ⚠️ `accuracy_percentage` < 100%
- ⚠️ `total_incorrect` > 0
- ⚠️ Profiles with `is_karma_correct` = false

## 🔧 Troubleshooting

### If Many Profiles Have Discrepancies

1. **Check triggers are active:**
   ```sql
   SELECT * FROM pg_trigger 
   WHERE tgname LIKE '%reputation%';
   ```

2. **Check for bulk operations:**
   - Were clips bulk deleted/updated?
   - Were reactions bulk modified?
   - Run recalculation for affected profiles

3. **Check calculation functions:**
   ```sql
   -- Test calculation for a known profile
   SELECT 
     id,
     handle,
     reputation as stored,
     public.calculate_user_reputation(id) as calculated
   FROM public.profiles
   WHERE id = 'known-profile-uuid';
   ```

### If Specific Profiles Have Issues

1. **Get detailed breakdown:**
   ```sql
   SELECT * FROM public.get_reputation_breakdown('profile-uuid');
   ```

2. **Check clip status:**
   ```sql
   SELECT status, COUNT(*) 
   FROM public.clips 
   WHERE profile_id = 'profile-uuid'
   GROUP BY status;
   ```

3. **Check for deleted clips:**
   ```sql
   SELECT COUNT(*) 
   FROM public.clips 
   WHERE profile_id = 'profile-uuid' 
     AND status = 'deleted';
   ```

## 📝 Reporting

After validation, document:

1. **Validation Date:** When was validation run?
2. **Scope:** How many profiles checked?
3. **Results:** Accuracy percentage, number of discrepancies
4. **Issues Found:** List of profiles with issues
5. **Root Causes:** What caused the discrepancies?
6. **Actions Taken:** What was fixed?

## ✅ Completion Criteria

Reputation calculations are validated when:

- [ ] Batch validation shows 100% accuracy (or acceptable threshold)
- [ ] All discrepancies have been investigated
- [ ] Root causes have been identified and fixed
- [ ] All affected profiles have been corrected
- [ ] Validation has been documented

---

**Note:** This is a manual review process. The validation functions help identify issues, but human judgment is needed to determine if discrepancies are legitimate or indicate bugs.

