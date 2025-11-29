# Contributing to Echo Garden

Thank you for your interest in contributing to Echo Garden! This document provides guidelines and instructions for contributing.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Testing](#testing)
- [Documentation](#documentation)
- [Questions?](#questions)

## 📜 Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for details.

## 🚀 Getting Started

1. **Fork the repository**
2. **Clone your fork**:
   ```bash
   git clone https://github.com/your-username/echo-garden-49-main.git
   cd echo-garden-49-main
   ```
3. **Set up your development environment** (see [Development Setup](#development-setup))

## 💻 Development Setup

### Prerequisites

- Node.js 18+ and npm
- Supabase account (for backend)
- Git

### Setup Steps

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   - Copy `.env.example` to `.env` (if exists) or create `.env`
   - Fill in your Supabase credentials:
     ```
     VITE_SUPABASE_URL=your_supabase_url
     VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
     ```
   - See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for all variables

3. **Start development server**:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:8080/`

4. **Run tests**:
   ```bash
   npm test
   ```

For more details, see [DEVELOPMENT.md](./DEVELOPMENT.md).

## 🔨 Making Changes

### Branch Naming

Use descriptive branch names:
- `feature/voice-reactions` - New features
- `fix/audio-playback` - Bug fixes
- `docs/api-documentation` - Documentation
- `refactor/audio-player` - Code refactoring
- `test/add-clip-tests` - Adding tests

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): subject

body (optional)

footer (optional)
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

**Examples**:
```
feat(audio): add playback speed control

fix(api): resolve 404 error on clip endpoint

docs(readme): update setup instructions

test(clips): add unit tests for ClipCard component
```

## 🔀 Pull Request Process

1. **Update your fork**:
   ```bash
   git checkout main
   git pull upstream main
   ```

2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**:
   - Write clean, tested code
   - Follow code style guidelines
   - Update documentation as needed

4. **Test your changes**:
   ```bash
   npm test
   npm run lint
   ```

5. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat(scope): your commit message"
   ```

6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create a Pull Request**:
   - Use a clear, descriptive title
   - Describe your changes in detail
   - Link related issues
   - Request review from maintainers

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Tests pass locally (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] Documentation updated (if applicable)
- [ ] No console errors
- [ ] Changes are backward compatible (if applicable)
- [ ] Added tests for new features
- [ ] Updated CHANGELOG.md (if applicable)

## 📝 Code Style

### TypeScript/React

- Use TypeScript for type safety
- Follow React best practices
- Use functional components with hooks
- Prefer named exports
- Use meaningful variable names
- Add JSDoc comments for complex functions

### Formatting

- Use Prettier (configured in project)
- Run `npm run lint` before committing
- Follow ESLint rules
- Maximum line length: 100 characters

### File Structure

```
src/
├── components/     # React components
│   ├── ui/        # shadcn-ui components
│   └── ...        # Feature components
├── hooks/          # Custom React hooks
├── lib/            # Utility functions
├── pages/          # Page components (routes)
├── context/        # React contexts
└── integrations/   # External integrations
```

### Component Guidelines

- One component per file
- Use TypeScript interfaces for props
- Extract reusable logic into hooks
- Keep components focused and small
- Use composition over inheritance

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

### Writing Tests

- Write tests for new features
- Write tests for bug fixes
- Aim for good test coverage (>80%)
- Use descriptive test names
- Test edge cases and error handling

### Test Structure

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClipCard } from '@/components/ClipCard';

describe('ClipCard', () => {
  it('should render clip title', () => {
    const clip = { id: '1', title: 'Test Clip' };
    render(<ClipCard clip={clip} />);
    expect(screen.getByText('Test Clip')).toBeInTheDocument();
  });
});
```

See [TESTING.md](./TESTING.md) for more details.

## 📚 Documentation

### Updating Documentation

- Update relevant docs when adding features
- Add code examples where helpful
- Keep documentation up-to-date
- Use clear, concise language
- Include screenshots for UI changes

### Documentation Files

- `README.md` - Project overview
- `API_DOCUMENTATION.md` - API reference
- `SECURITY.md` - Security guide
- `USER_TUTORIAL.md` - User guide
- `ARCHITECTURE.md` - System architecture
- Feature-specific docs in `docs/`

## 🐛 Reporting Bugs

### Before Reporting

1. Check existing issues
2. Verify it's a bug, not a feature request
3. Try to reproduce the issue
4. Check if it's already fixed in the latest version

### Bug Report Template

```markdown
**Description**
Clear description of the bug

**Steps to Reproduce**
1. Step one
2. Step two
3. See error

**Expected Behavior**
What should happen

**Actual Behavior**
What actually happens

**Environment**
- OS: [e.g., Windows 10]
- Browser: [e.g., Chrome 120]
- Node.js version: [e.g., 18.17.0]
- Version: [e.g., 1.0.0]

**Screenshots**
If applicable

**Additional Context**
Any other relevant information
```

## 💡 Suggesting Features

### Feature Request Template

```markdown
**Feature Description**
Clear description of the feature

**Use Case**
Why is this feature needed?

**Proposed Solution**
How should it work?

**Alternatives Considered**
Other solutions you've thought about

**Additional Context**
Any other relevant information
```

## ❓ Questions?

- **Documentation**: Check [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md)
- **Issues**: Open an issue on GitHub
- **Discussions**: Use GitHub Discussions
- **Security**: See [SECURITY.md](./SECURITY.md)
- **Architecture**: See [ARCHITECTURE.md](./ARCHITECTURE.md)

## 🙏 Thank You!

Your contributions make Echo Garden better for everyone. Thank you for taking the time to contribute!

---

**Last Updated**: 2025-01-27

