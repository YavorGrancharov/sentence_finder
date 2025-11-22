# SentenceFinder

A high-performance TypeScript library for searching and managing collections of sentences with features like ranked results, prefix suggestions, and word frequency analysis.

## Features

- 🔍 **Smart Search**: Find sentences by word matches with configurable strictness
# SentenceFinder

A high-performance TypeScript library for searching and managing collections of sentences. It supports ranked searches, prefix suggestions, partial/substring matching, merge/deduplication, word-frequency inspection and a small event API.

## Highlights

- Smart search with configurable matching behavior (exact, prefix fallback, partial/substring).
- Ranked results that prefer exact word matches, then prefixes, then substrings; ties broken by earliest match position and original insertion order.
- Fast prefix suggestions (binary search over a cached sorted dictionary).
- Merge multiple finders with optional deduplication.
- Expose internal dictionary and word frequency maps for analysis.
- Small event system for `init`, `search`, `suggest`, `merge`, and `reset` events.

---

## Installation

```bash
npm install sentence-finder
```

## Quick start

```ts
import { SentenceFinder } from 'sentence-finder';

// Create finder with defaults
const finder = new SentenceFinder();

// Initialize with sentences
finder.init([
  'The quick brown fox jumps over the lazy dog',
  'Quick foxes are known for jumping',
  'Dogs are usually lazy in the afternoon',
]);

// Simple search (non-ranked)
console.log(finder.searchArray('fox jump'));

// Ranked search
const { results } = finder.search('fox jump', { ranked: true });
console.log(results);
```

---

## Constructor options

```ts
interface SentenceFinderOptions {
  min_match_count?: number; // Minimum number of matched tokens required (default: 3)
  case_sensitive?: boolean; // Whether token matching is case-sensitive (default: false)
  tokenizer?: (text: string) => string[]; // Provide a custom tokenizer
  strict_tokens?: boolean; // Use the built-in strict tokenizer (default: false)
}
```

Notes:
- The default `min_match_count` is intentionally conservative (3) to avoid noisy single-word matches; set it to `1` for single-token searches or in tests/examples where appropriate.
- `case_sensitive: false` (default) means tokens are normalized to lower-case before indexing and searching.

---

## Tokenizers

- default tokenizer: splits on non-letter/non-number boundaries and (unless `case_sensitive` is true) lowercases tokens.
- strict tokenizer: preserves hyphenated words and contractions better and trims extra spaces; it still respects the `case_sensitive` option when producing tokens.
- custom tokenizer: pass a `(text: string) => string[]` to the constructor if you need special tokenization.

Example:
```ts
const finder = new SentenceFinder({ strict_tokens: true });
```

---

## Search

API:
```ts
search(text: string, options?: { ranked?: boolean; min_match_count?: number; partial?: boolean }): { results: string[]; finder: SentenceFinder }
searchArray(text: string, options?: { ranked?: boolean; min_match_count?: number; partial?: boolean }): string[]
```

Behavior:
- Tokenizes the input text using the configured tokenizer and normalizes tokens (unless `case_sensitive`).
- `partial: false` (default) performs exact word matching. If an exact token is not present in the dictionary, the search will fall back to prefix matching (dictionary words that start with the token).
- `partial: true` performs substring matching across dictionary words.
- Matches are counted per sentence; only sentences with at least `min_match_count` distinct token matches are returned.

Ranking (when `ranked: true`):
- A weighted score is computed per sentence based on occurrences of the search tokens inside the sentence tokens.
- Preference order: exact word matches (strongest) > prefix matches > substring matches.
- Ties are broken by earliest token position where a match appears in the sentence, then by original insertion order.

Examples:
```ts
finder.searchArray('fox jump'); // non-ranked
finder.search('fox jump', { ranked: true }); // ranked
finder.search('irr', { partial: true }); // substring matches
```

---

## Suggestions

API:
```ts
suggest(prefix: string): { suggestions: string[]; finder: SentenceFinder }
```

- Returns dictionary words that start with the provided prefix.
- Uses a cached sorted array of dictionary keys and binary search for fast lookups.
- Cache is invalidated when the dictionary is modified (via `init`, `merge`, or `reset`).

---

## Merge and deduplication

API:
```ts
merge(finder: SentenceFinder, options?: { deduplicate?: boolean }): this
```

- Merges another `SentenceFinder` instance into this one.
- `deduplicate: true` will avoid adding duplicate sentences that already exist in the receiving finder.
- When deduplicating the implementation ensures new sentences are added and their tokens are indexed; word frequency is updated accordingly for newly added sentences.

Note: merging preserves the receiving finder's tokenizer/case-sensitivity configuration for how sentences are indexed after merge.

---

## Collection management

- `init(sentences: string[]): this` — initialize or re-initialize the finder with a new collection. Clears previous indexes and caches.
- `reset(): this` — clear collection, dictionary, frequencies and caches.

---

## Analysis helpers

- `getDictionary(): Map<string, number[]>` — returns the internal mapping of token -> sentence index list.
- `getWordFrequency(): Map<string, number>` — returns a map of token -> occurrence count across the collection.

These are useful for debugging, exporting statistics, or building external visualizations.

---

## Events

You can subscribe to lifecycle events using `on(event, listener)`:

Supported events:
- `init` — called after `init` completes with the number of sentences
- `search` — called after each `search` with the number of results
- `suggest` — called after each `suggest` with the number of suggestions
- `merge` — called after `merge` with the number of sentences merged
- `reset` — called after `reset`

Example:
```ts
finder.on('search', count => console.log(`Found ${count} matches`));
```

---

## Performance notes

- `search` (non-ranked) uses direct dictionary lookups where possible and only scans keys for prefix/substring fallbacks when needed.
- `search` (ranked) computes per-sentence scores based on token occurrences; this is efficient for moderate collections but will perform more work than non-ranked searches.
- `suggest` uses binary search on a cached sorted key array — first call may pay the sort cost; subsequent calls are fast.
- `merge` with deduplication does additional work to avoid duplicates; for very large datasets consider batching or incremental updates.

---

## Examples

See the `examples/` folder for small runnable snippets demonstrating initialization, searching, suggestions, merging and tokenization options.

---

## Contributing

Contributions welcome — open an issue or submit a pull request.

## License

MIT
