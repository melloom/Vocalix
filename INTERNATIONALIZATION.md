# Internationalization (i18n) Guide

Guide for adding multi-language support to Echo Garden.

## 📋 Table of Contents

- [Current Status](#current-status)
- [Supported Languages](#supported-languages)
- [Adding New Languages](#adding-new-languages)
- [Translation Process](#translation-process)
- [Locale Handling](#locale-handling)

## 📊 Current Status

Echo Garden currently supports:
- **Primary Language**: English (en)
- **Future**: Multi-language support planned

## 🌍 Supported Languages

### Planned Languages

- English (en) - ✅ Current
- Spanish (es) - 📋 Planned
- French (fr) - 📋 Planned
- German (de) - 📋 Planned
- More languages based on user demand

## ➕ Adding New Languages

### Step 1: Create Translation Files

Create translation files in `src/locales/`:

```
src/locales/
├── en/
│   └── common.json
├── es/
│   └── common.json
└── fr/
    └── common.json
```

### Step 2: Translation File Structure

```json
// src/locales/en/common.json
{
  "welcome": "Welcome to Echo Garden",
  "record": "Record",
  "play": "Play",
  "pause": "Pause"
}
```

### Step 3: Implement i18n Library

Use a library like `react-i18next`:

```typescript
import { useTranslation } from 'react-i18next';

function Component() {
  const { t } = useTranslation();
  return <h1>{t('welcome')}</h1>;
}
```

## 🔄 Translation Process

### 1. Identify Strings

Find all user-facing strings in the codebase.

### 2. Extract Strings

Create translation keys for each string.

### 3. Translate

- Use professional translators
- Or use community contributions
- Review translations for accuracy

### 4. Test

Test the application in each language:
- UI layout (text expansion)
- Date/time formatting
- Number formatting

## 🌐 Locale Handling

### Date Formatting

```typescript
import { format } from 'date-fns';
import { enUS, es, fr } from 'date-fns/locale';

const date = new Date();
format(date, 'PPpp', { locale: enUS }); // English
format(date, 'PPpp', { locale: es }); // Spanish
```

### Number Formatting

```typescript
const number = 1234.56;

// English
new Intl.NumberFormat('en-US').format(number); // 1,234.56

// Spanish
new Intl.NumberFormat('es-ES').format(number); // 1.234,56
```

### Currency Formatting

```typescript
const amount = 1234.56;

new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
}).format(amount); // $1,234.56
```

## 📝 Best Practices

1. **Don't Hardcode Strings**: Always use translation keys
2. **Context Matters**: Provide context for translators
3. **Pluralization**: Handle plural forms correctly
4. **Text Expansion**: Design UI to accommodate longer text
5. **RTL Support**: Consider right-to-left languages

## 🔗 Related Resources

- [react-i18next](https://react.i18next.com/)
- [date-fns](https://date-fns.org/)
- [Intl API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)

---

**Last Updated**: 2025-01-27

