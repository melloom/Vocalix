# Testing Guide

This guide covers testing strategies, how to run tests, and best practices for writing tests in Echo Garden.

## 📋 Table of Contents

- [Testing Strategy](#testing-strategy)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Coverage](#test-coverage)
- [Testing Best Practices](#testing-best-practices)
- [E2E Testing](#e2e-testing)
- [Integration Testing](#integration-testing)

## 🎯 Testing Strategy

### Test Pyramid

```
        /\
       /  \      E2E Tests (Few)
      /____\
     /      \    Integration Tests (Some)
    /________\
   /          \  Unit Tests (Many)
  /____________\
```

### Test Types

1. **Unit Tests** - Test individual functions/components in isolation
2. **Integration Tests** - Test interactions between components/services
3. **E2E Tests** - Test complete user flows

### Testing Tools

- **Vitest** - Test runner and framework
- **React Testing Library** - Component testing
- **jsdom** - DOM simulation
- **@testing-library/user-event** - User interaction simulation

## 🏃 Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui

# Run specific test file
npm test -- Component.test.tsx

# Run tests matching pattern
npm test -- --grep "ClipCard"
```

### Watch Mode

```bash
npm test -- --watch
```

Options in watch mode:
- `a` - Run all tests
- `f` - Run only failed tests
- `p` - Filter by filename pattern
- `t` - Filter by test name pattern
- `q` - Quit watch mode

## ✍️ Writing Tests

### Component Tests

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClipCard } from '@/components/ClipCard';

describe('ClipCard', () => {
  const mockClip = {
    id: '1',
    title: 'Test Clip',
    profile_id: 'profile-1',
    audio_path: '/audio/test.mp3',
    duration_seconds: 30,
  };

  it('should render clip title', () => {
    render(<ClipCard clip={mockClip} />);
    expect(screen.getByText('Test Clip')).toBeInTheDocument();
  });

  it('should display duration', () => {
    render(<ClipCard clip={mockClip} />);
    expect(screen.getByText('30s')).toBeInTheDocument();
  });
});
```

### Hook Tests

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFollow } from '@/hooks/useFollow';

describe('useFollow', () => {
  it('should toggle follow state', () => {
    const { result } = renderHook(() => useFollow('profile-1'));
    
    expect(result.current.isFollowing).toBe(false);
    
    act(() => {
      result.current.toggleFollow();
    });
    
    expect(result.current.isFollowing).toBe(true);
  });
});
```

### Utility Function Tests

```typescript
import { describe, it, expect } from 'vitest';
import { formatDuration } from '@/lib/utils';

describe('formatDuration', () => {
  it('should format seconds correctly', () => {
    expect(formatDuration(30)).toBe('30s');
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(90)).toBe('1m 30s');
  });
});
```

### Async Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ClipCard } from '@/components/ClipCard';

describe('ClipCard async behavior', () => {
  it('should load clip data', async () => {
    render(<ClipCard clipId="1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Clip')).toBeInTheDocument();
    });
  });
});
```

### Mocking

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClipCard } from '@/components/ClipCard';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: mockClip })),
        })),
      })),
    })),
  },
}));

describe('ClipCard with mocked data', () => {
  it('should render with mocked data', () => {
    render(<ClipCard clipId="1" />);
    // Test implementation
  });
});
```

## 📊 Test Coverage

### Coverage Goals

- **Unit Tests**: >80% coverage
- **Integration Tests**: >60% coverage
- **E2E Tests**: Critical user flows

### Viewing Coverage

```bash
npm run test:coverage
```

Coverage report shows:
- Statement coverage
- Branch coverage
- Function coverage
- Line coverage

### Coverage Configuration

In `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
      ],
    },
  },
});
```

## ✅ Testing Best Practices

### 1. Test Behavior, Not Implementation

```typescript
// ❌ Bad: Testing implementation
it('should call setState', () => {
  const setState = vi.fn();
  // ...
});

// ✅ Good: Testing behavior
it('should display error message when validation fails', () => {
  render(<Form />);
  // Test what user sees
});
```

### 2. Use Descriptive Test Names

```typescript
// ❌ Bad
it('test 1', () => { });

// ✅ Good
it('should display clip title when clip data is loaded', () => { });
```

### 3. Arrange-Act-Assert Pattern

```typescript
it('should increment counter when button is clicked', () => {
  // Arrange
  render(<Counter />);
  const button = screen.getByRole('button', { name: /increment/i });
  
  // Act
  fireEvent.click(button);
  
  // Assert
  expect(screen.getByText('1')).toBeInTheDocument();
});
```

### 4. Test Edge Cases

```typescript
describe('ClipCard edge cases', () => {
  it('should handle missing audio path', () => {
    const clip = { ...mockClip, audio_path: null };
    render(<ClipCard clip={clip} />);
    // Test fallback behavior
  });
  
  it('should handle very long titles', () => {
    const clip = { ...mockClip, title: 'a'.repeat(200) };
    render(<ClipCard clip={clip} />);
    // Test truncation
  });
});
```

### 5. Keep Tests Isolated

```typescript
// Each test should be independent
describe('ClipCard', () => {
  beforeEach(() => {
    // Reset state before each test
  });
  
  it('test 1', () => { });
  it('test 2', () => { }); // Should not depend on test 1
});
```

## 🌐 E2E Testing

### Setup (Future)

E2E testing can be added with:
- **Playwright** - Cross-browser testing
- **Cypress** - Modern E2E testing
- **Puppeteer** - Chrome automation

### Example E2E Test (Conceptual)

```typescript
import { test, expect } from '@playwright/test';

test('user can record and publish a clip', async ({ page }) => {
  await page.goto('http://localhost:8080');
  
  // Click record button
  await page.click('[data-testid="record-button"]');
  
  // Record audio (mock)
  await page.click('[data-testid="start-recording"]');
  await page.waitForTimeout(2000);
  await page.click('[data-testid="stop-recording"]');
  
  // Publish
  await page.click('[data-testid="publish-button"]');
  
  // Verify clip appears in feed
  await expect(page.locator('[data-testid="clip-card"]')).toBeVisible();
});
```

## 🔗 Integration Testing

### Testing API Integration

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ClipCard } from '@/components/ClipCard';

describe('ClipCard API integration', () => {
  it('should fetch and display clip data', async () => {
    // Mock API response
    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ data: mockClip }),
      })
    );
    
    render(<ClipCard clipId="1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Clip')).toBeInTheDocument();
    });
  });
});
```

### Testing Context Integration

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthProvider } from '@/context/AuthContext';
import { Component } from './Component';

describe('Component with Auth context', () => {
  it('should render with authenticated user', () => {
    render(
      <AuthProvider>
        <Component />
      </AuthProvider>
    );
    // Test authenticated state
  });
});
```

## 📝 Test File Organization

### Structure

```
src/
├── components/
│   ├── ClipCard.tsx
│   └── ClipCard.test.tsx
├── hooks/
│   ├── useFollow.ts
│   └── useFollow.test.ts
└── lib/
    ├── utils.ts
    └── utils.test.ts
```

### Test File Naming

- Component tests: `Component.test.tsx`
- Hook tests: `hook.test.ts`
- Utility tests: `utils.test.ts`

## 🐛 Debugging Tests

### VS Code Debugging

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["test", "--", "--run"],
      "console": "integratedTerminal"
    }
  ]
}
```

### Console Logging

```typescript
it('should debug test', () => {
  const result = someFunction();
  console.log('Result:', result);
  expect(result).toBe(expected);
});
```

## 📚 Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

**Last Updated**: 2025-01-27

