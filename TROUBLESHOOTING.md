# Troubleshooting Guide

Common issues and solutions for Echo Garden development and deployment.

## 📋 Table of Contents

- [Development Issues](#development-issues)
- [Build Issues](#build-issues)
- [Runtime Issues](#runtime-issues)
- [Database Issues](#database-issues)
- [API Issues](#api-issues)
- [Performance Issues](#performance-issues)
- [Deployment Issues](#deployment-issues)

## 🔧 Development Issues

### Port Already in Use

**Problem**: `Error: Port 8080 is already in use`

**Solution**:
```bash
# Windows
netstat -ano | findstr :8080
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:8080 | xargs kill

# Or use different port
npm run dev -- --port 3000
```

### Module Not Found

**Problem**: `Error: Cannot find module '...'`

**Solution**:
```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install

# Check if package is in package.json
npm list <package-name>
```

### TypeScript Errors

**Problem**: TypeScript compilation errors

**Solution**:
```bash
# Check TypeScript version
npx tsc --version

# Clear TypeScript cache
rm -rf node_modules/.cache

# Restart TypeScript server (VS Code: Cmd/Ctrl + Shift + P → "TypeScript: Restart TS Server")
```

### Hot Module Replacement Not Working

**Problem**: Changes not reflecting in browser

**Solution**:
```bash
# Clear Vite cache
rm -rf node_modules/.vite

# Restart dev server
npm run dev
```

## 🏗️ Build Issues

### Build Fails

**Problem**: `npm run build` fails

**Solution**:
```bash
# Check for errors
npm run build 2>&1 | tee build.log

# Clear build cache
rm -rf dist .vite node_modules/.vite

# Check Node.js version (should be 18+)
node --version

# Rebuild
npm run build
```

### Build Size Too Large

**Problem**: Bundle size exceeds limits

**Solution**:
- Enable code splitting
- Use lazy loading for routes
- Optimize images
- Remove unused dependencies
- Check bundle analyzer: `npm run build -- --analyze`

### TypeScript Build Errors

**Problem**: TypeScript errors in build

**Solution**:
```bash
# Check tsconfig.json
npx tsc --noEmit

# Fix type errors
# Or temporarily: "skipLibCheck": true in tsconfig.json
```

## 🐛 Runtime Issues

### Blank Screen

**Problem**: App loads but shows blank screen

**Solution**:
1. Check browser console for errors
2. Check network tab for failed requests
3. Verify environment variables
4. Check Supabase connection
5. Verify build output

### Audio Not Playing

**Problem**: Audio clips don't play

**Solution**:
- Check browser audio permissions
- Verify audio file URLs are accessible
- Check CORS settings
- Verify audio format (MP3, WebM)
- Check browser console for errors

### Supabase Connection Errors

**Problem**: `Failed to fetch` or connection errors

**Solution**:
1. Verify `VITE_SUPABASE_URL` is correct
2. Verify `VITE_SUPABASE_ANON_KEY` is correct
3. Check Supabase project is active
4. Check network connectivity
5. Verify CORS settings in Supabase

### Authentication Issues

**Problem**: Can't log in or create account

**Solution**:
- Check device ID in localStorage
- Clear browser cache and localStorage
- Verify Supabase Auth is enabled
- Check RLS policies
- Verify profile creation permissions

## 🗄️ Database Issues

### Migration Errors

**Problem**: Database migration fails

**Solution**:
```sql
-- Check migration status
SELECT * FROM supabase_migrations.schema_migrations;

-- Rollback if needed
-- (Create reverse migration)

-- Verify table exists
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public';
```

### RLS Policy Issues

**Problem**: Can't access data due to RLS

**Solution**:
```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Check policies
SELECT * FROM pg_policies 
WHERE tablename = 'clips';

-- Temporarily disable RLS for testing (NOT for production)
ALTER TABLE public.clips DISABLE ROW LEVEL SECURITY;
```

### Connection Pool Exhausted

**Problem**: Too many database connections

**Solution**:
- Check connection pooling settings
- Close unused connections
- Use connection pooling (Supabase handles this)
- Check for connection leaks

## 🔌 API Issues

### 404 Errors

**Problem**: API endpoints return 404

**Solution**:
- Verify endpoint URL
- Check Supabase project URL
- Verify table/function exists
- Check RLS policies allow access

### 403 Forbidden

**Problem**: API returns 403

**Solution**:
- Check RLS policies
- Verify authentication
- Check API key (if using public API)
- Verify user permissions

### Rate Limiting

**Problem**: Too many requests error

**Solution**:
- Implement request throttling
- Add caching
- Reduce request frequency
- Check rate limit settings

## ⚡ Performance Issues

### Slow Page Load

**Problem**: Pages load slowly

**Solution**:
- Enable code splitting
- Use lazy loading
- Optimize images
- Enable compression
- Check network tab for slow requests
- Use CDN for static assets

### Slow Database Queries

**Problem**: Database queries are slow

**Solution**:
```sql
-- Check query performance
EXPLAIN ANALYZE SELECT * FROM clips WHERE status = 'live';

-- Add indexes
CREATE INDEX idx_clips_status ON clips(status);
CREATE INDEX idx_clips_created_at ON clips(created_at DESC);

-- Optimize queries
-- Use SELECT specific columns
-- Add WHERE clauses
-- Use pagination
```

### Memory Leaks

**Problem**: App uses increasing memory

**Solution**:
- Check for event listeners not cleaned up
- Clear intervals/timeouts
- Unsubscribe from subscriptions
- Check React component cleanup
- Use React DevTools Profiler

## 🚀 Deployment Issues

### Build Fails on Deploy

**Problem**: Deployment build fails

**Solution**:
- Check build logs
- Verify Node.js version in hosting config
- Check environment variables
- Verify build command
- Test build locally first

### Environment Variables Not Working

**Problem**: Environment variables not available

**Solution**:
- Verify variables are set in hosting dashboard
- Check variable names (must start with `VITE_` for Vite)
- Redeploy after adding variables
- Check variable values (no quotes needed)

### CORS Errors

**Problem**: CORS errors in production

**Solution**:
- Add production domain to Supabase CORS settings
- Check Supabase Dashboard → Settings → API → CORS
- Verify request headers
- Check browser console for CORS errors

### 404 on Refresh

**Problem**: 404 when refreshing routes

**Solution**:
- Configure redirects (see DEPLOYMENT.md)
- For Vercel: Add `vercel.json` with rewrites
- For Netlify: Add `netlify.toml` with redirects

## 🔍 Debugging Tips

### Browser DevTools

- **Console**: Check for errors
- **Network**: Monitor API requests
- **Application**: Check localStorage, IndexedDB
- **Performance**: Profile performance
- **React DevTools**: Inspect component tree

### Supabase Dashboard

- **Logs**: Check Edge Function logs
- **Database**: Check query performance
- **API**: Monitor API usage
- **Storage**: Check storage usage

### VS Code Debugging

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Launch Chrome",
      "url": "http://localhost:8080",
      "webRoot": "${workspaceFolder}/src"
    }
  ]
}
```

## 📞 Getting Help

### Check Documentation

- [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md) - All documentation
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development guide
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Architecture details

### Common Resources

- [Supabase Documentation](https://supabase.com/docs)
- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)

### Report Issues

- Create GitHub issue with:
  - Error message
  - Steps to reproduce
  - Environment details
  - Screenshots/logs

---

**Last Updated**: 2025-01-27

