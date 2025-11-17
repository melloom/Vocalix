# Accessibility Guide

Accessibility features, compliance, and best practices for Echo Garden.

## 📋 Table of Contents

- [Accessibility Features](#accessibility-features)
- [WCAG Compliance](#wcag-compliance)
- [Testing Accessibility](#testing-accessibility)
- [Best Practices](#best-practices)
- [Tools and Resources](#tools-and-resources)

## ♿ Accessibility Features

### Built-in Features

- **Automatic Captions**: All clips are automatically transcribed
- **Caption Toggle**: Users can show/hide captions
- **Keyboard Navigation**: Full keyboard support
- **Screen Reader Support**: ARIA labels and semantic HTML
- **High Contrast Mode**: Dark/light theme support
- **Focus Indicators**: Visible focus states

### User Preferences

Users can customize:
- Caption size and position
- Playback speed (0.5x to 2x)
- Theme preference (dark/light)

## ✅ WCAG Compliance

### Level AA Compliance (Target)

- **Perceivable**: Content is perceivable to all users
- **Operable**: Interface is operable via keyboard
- **Understandable**: Content is understandable
- **Robust**: Works with assistive technologies

### Key Requirements

- **Color Contrast**: Minimum 4.5:1 for text
- **Keyboard Access**: All functionality accessible via keyboard
- **Focus Indicators**: Visible focus states
- **Alt Text**: Images have descriptive alt text
- **ARIA Labels**: Interactive elements have labels

## 🧪 Testing Accessibility

### Automated Testing

```bash
# Use axe DevTools browser extension
# Or Lighthouse accessibility audit
```

### Manual Testing

1. **Keyboard Navigation**
   - Tab through all interactive elements
   - Verify focus indicators
   - Test keyboard shortcuts

2. **Screen Reader**
   - Test with NVDA (Windows)
   - Test with VoiceOver (Mac)
   - Verify ARIA labels

3. **Color Contrast**
   - Use contrast checker tools
   - Verify all text meets WCAG AA

## 📝 Best Practices

### Semantic HTML

```html
<!-- ✅ Good -->
<button>Record</button>
<nav>Navigation</nav>
<main>Main content</main>

<!-- ❌ Bad -->
<div onClick={...}>Record</div>
<div>Navigation</div>
```

### ARIA Labels

```tsx
// ✅ Good
<button aria-label="Record new clip">
  <MicrophoneIcon />
</button>

// ❌ Bad
<button>
  <MicrophoneIcon />
</button>
```

### Keyboard Support

```tsx
// ✅ Good
<button
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick();
    }
  }}
>
  Click me
</button>
```

### Focus Management

```tsx
// ✅ Good
const inputRef = useRef<HTMLInputElement>(null);

useEffect(() => {
  inputRef.current?.focus();
}, []);
```

## 🛠️ Tools and Resources

### Testing Tools

- **axe DevTools**: Browser extension
- **Lighthouse**: Accessibility audits
- **WAVE**: Web accessibility evaluation
- **NVDA**: Screen reader (Windows)
- **VoiceOver**: Screen reader (Mac)

### Resources

- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM](https://webaim.org/)
- [A11y Project](https://www.a11yproject.com/)

## 📋 Accessibility Checklist

### Content
- [ ] All images have alt text
- [ ] Videos have captions
- [ ] Audio has transcripts
- [ ] Color is not the only indicator

### Navigation
- [ ] Keyboard accessible
- [ ] Focus indicators visible
- [ ] Skip links available
- [ ] Logical tab order

### Forms
- [ ] Labels associated with inputs
- [ ] Error messages clear
- [ ] Required fields indicated
- [ ] Validation accessible

### Code
- [ ] Semantic HTML used
- [ ] ARIA labels where needed
- [ ] Keyboard handlers implemented
- [ ] Focus management correct

## 🔗 Related Documentation

- [USER_TUTORIAL.md](./USER_TUTORIAL.md) - User guide with accessibility info

---

**Last Updated**: 2025-01-27

