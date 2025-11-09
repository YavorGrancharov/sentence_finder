# SentenceFinder

A high-performance TypeScript library for searching and managing collections of sentences with features like ranked results, prefix suggestions, and word frequency analysis.

## Features

- 🔍 **Smart Search**: Find sentences by word matches with configurable strictness
- 📊 **Ranked Results**: Sort matches by relevance
- ⚡ **High Performance**:
  - O(1) lookups for ranked searches
  - Binary search for prefix suggestions
  - Cached sorting for repeated operations
- 🎯 **Flexible Matching**:
  - Case sensitivity toggle
  - Strict or relaxed tokenization
  - Custom tokenizer support
- 🔄 **Collection Management**:
  - Merge multiple collections
  - Optional sentence deduplication
  - Reset and reinitialize
- 📈 **Analysis Tools**:
  - Word frequency statistics
  - Dictionary inspection
  - Prefix-based suggestions
- 🎮 **Event System**: Hooks for init, search, suggest, merge, and reset operations

## Installation

```bash
npm install sentence-finder
```

## Quick Start

```typescript
import { SentenceFinder } from "sentence-finder";

// Initialize with default options
const finder = new SentenceFinder();

// Add some sentences
finder
  .init([
    "The quick brown fox jumps over the lazy dog",
    "Quick foxes are known for jumping",
    "Dogs are usually lazy in the afternoon",
  ])
  .on("search", (count) => console.log(`Found ${count} matches`));

// Simple search
const matches = finder.searchArray("fox jump");
console.log(matches);
// → ["The quick brown fox jumps over the lazy dog", "Quick foxes are known for jumping"]

// Ranked search with chaining
const { results, finder: f } = finder
  .search("fox jump", { ranked: true })
  .suggest("qu");

console.log(results); // Ranked matching sentences
console.log(suggestions); // Words starting with "qu"
```

## Advanced Usage

### Configuration Options

```typescript
const finder = new SentenceFinder({
  min_match_count: 2, // Minimum word matches required (default: 3)
  case_sensitive: true, // Enable case-sensitive matching (default: false)
  strict_tokens: true, // Use stricter tokenization (default: false)
  tokenizer: customFn, // Provide custom tokenization function
});
```

### Strict Tokenization

The strict tokenizer preserves:

- Hyphenated words ("hi-tech" stays as one token)
- Contractions ("I'm" remains intact)
- Better boundary handling

```typescript
const finder = new SentenceFinder({ strict_tokens: true });
finder.init(["Hi-tech solutions", "High tech answers"]);

finder.searchArray("hi-tech"); // Only matches "Hi-tech solutions"
```

### Merging Collections

```typescript
const mainFinder = new SentenceFinder().init(["Common sentence", "Unique one"]);
const otherFinder = new SentenceFinder().init([
  "Common sentence",
  "Another unique",
]);

// Merge with deduplication
mainFinder.merge(otherFinder, { deduplicate: true });
```

### Event Handling

```typescript
finder
  .on("init", (count) => console.log(`Initialized with ${count} sentences`))
  .on("search", (count) => console.log(`Found ${count} matches`))
  .on("suggest", (count) => console.log(`Found ${count} suggestions`))
  .on("merge", (count) => console.log(`Merged ${count} new sentences`))
  .on("reset", () => console.log("Finder reset"));
```

### Analysis Tools

```typescript
// Get word frequencies
const frequencies = finder.getWordFrequency();
console.log(frequencies.get("fox")); // → 2

// Inspect word-to-sentence mapping
const dictionary = finder.getDictionary();
console.log(dictionary.get("quick")); // → [0, 1] (sentence indexes)

// Get word suggestions
const { suggestions } = finder.suggest("fo");
console.log(suggestions); // → ["fox", "foxes"]
```

## API Reference

### Constructor Options

```typescript
interface SentenceFinderOptions {
  min_match_count?: number; // Minimum word matches required
  case_sensitive?: boolean; // Enable case sensitivity
  tokenizer?: (text: string) => string[]; // Custom tokenizer
  strict_tokens?: boolean; // Use strict tokenization
}
```

### Methods

#### Core Operations

- `init(sentences: string[]): this`
- `search(text: string, options?: SearchOptions): { results: string[]; finder: SentenceFinder }`
- `searchArray(text: string, options?: SearchOptions): string[]`
- `suggest(prefix: string): { suggestions: string[]; finder: SentenceFinder }`

#### Collection Management

- `merge(finder: SentenceFinder, options?: { deduplicate?: boolean }): this`
- `reset(): this`

#### Analysis

- `getDictionary(): Map<string, number[]>`
- `getWordFrequency(): Map<string, number>`

#### Event Handling

- `on(event: EventName, listener: EventListener): this`
- `emit(event: EventName, ...args: any[]): this`

### Types

```typescript
type EventName = "init" | "search" | "suggest" | "merge" | "reset";

interface SearchOptions {
  ranked?: boolean;
  min_match_count?: number;
}
```

## Performance Considerations

- `search` with `ranked: true` uses O(1) lookups instead of O(n)
- `suggest` uses binary search and caches sorted words
- `merge` with `deduplicate: true` has additional overhead
- Large collections benefit from strict tokenization

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
