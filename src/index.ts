export interface SentenceFinderOptions {
  min_match_count?: number;
  case_sensitive?: boolean;
  tokenizer?: (text: string) => string[];
  strict_tokens?: boolean; // When true, uses stricter tokenization
}

type EventName = "init" | "search" | "suggest" | "merge" | "reset";

interface EventListenerMap {
  init: (count: number) => void;
  search: (count: number) => void;
  suggest: (count: number) => void;
  merge: (count: number) => void;
  reset: () => void;
}

export class SentenceFinder {
  private readonly dictionary: Map<string, number[]>;
  private readonly word_frequency: Map<string, number>;
  private collection: string[];
  private match_count: Record<number, number>;
  private index_map: Map<string, number>; // For O(1) lookups
  private sorted_dictionary_cache: string[] | null = null; // Cache for sorted dictionary keys

  public min_match_count: number;
  public tokenizer: (text: string) => string[];
  public case_sensitive: boolean;
  public events: { [K in EventName]: EventListenerMap[K][] };

  constructor({
    min_match_count = 3,
    case_sensitive = false,
    tokenizer,
    strict_tokens = false,
  }: SentenceFinderOptions = {}) {
    this.dictionary = new Map();
    this.word_frequency = new Map();
    this.collection = [];
    this.match_count = {};
    this.index_map = new Map();
    this.min_match_count = min_match_count;
    this.case_sensitive = case_sensitive;
    this.events = {
      init: [],
      search: [],
      suggest: [],
      merge: [],
      reset: [],
    };
    this.tokenizer =
      tokenizer ||
      (strict_tokens ? this.strict_tokenizer : this.default_tokenizer);
  }

  /**
   * Default tokenizer that splits on word boundaries and removes punctuation.
   */
  private default_tokenizer = (text: string): string[] => {
    return text
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map((w) => w.toLowerCase());
  };

  /**
   * Strict tokenizer that preserves more text features for exact matching.
   * - Preserves hyphenated words as single tokens
   * - Keeps apostrophes in contractions
   * - Removes other punctuation
   * - Normalizes whitespace
   */
  private strict_tokenizer = (text: string): string[] => {
    return (
      text
        // Normalize whitespace
        .replace(/\s+/g, " ")
        // Split on boundaries but preserve hyphenated words and contractions
        .split(
          /(?<![\p{L}\p{N}'-])(?![\p{L}\p{N}'-])|(?<=[^\p{L}\p{N}'-])(?=[\p{L}\p{N}'-])/u
        )
        .map((token) => token.trim())
        .filter(Boolean)
        .map((w) => (this.case_sensitive ? w : w.toLowerCase()))
    );
  };

  private normalize_word = (word: string): string => {
    return this.case_sensitive ? word : word.toLowerCase();
  };

  public on = <K extends EventName>(
    event: K,
    listener: EventListenerMap[K]
  ): this => {
    this.events[event].push(listener);
    return this;
  };

  public emit = <K extends EventName>(
    event: K,
    ...args: Parameters<EventListenerMap[K]>
  ): this => {
    const listeners = this.events[event];
    for (const listener of listeners) {
      // Type assertion to handle the parameter spread safely
      (listener as (...args: any[]) => void)(...args);
    }
    return this;
  };

  /**
   * Initializes the sentence finder with an array of strings.
   * @param input Array of strings to index
   * @returns this for method chaining
   */
  public init = (input: string[]): this => {
    if (!Array.isArray(input)) throw new Error("Input must be an array");

    this.collection = [...input];
    this.dictionary.clear();
    this.word_frequency.clear();
    this.index_map.clear();
    this.sorted_dictionary_cache = null;

    // Store sentence indexes for O(1) lookup
    for (let i = 0; i < input.length; i++) {
      this.index_map.set(input[i], i);
      const words = this.tokenizer(input[i]);
      if (!words) continue;

      for (let j = 0; j < words.length; j++) {
        const key_word = this.normalize_word(words[j]);
        if (this.dictionary.has(key_word)) {
          const prev_indexes = this.dictionary.get(key_word)!;
          this.dictionary.set(key_word, [...prev_indexes, i]);
        } else {
          this.dictionary.set(key_word, [i]);
        }

        this.word_frequency.set(
          key_word,
          (this.word_frequency.get(key_word) || 0) + 1
        );
      }
    }

    this.emit("init", this.collection.length);
    return this;
  };

  /**
   * Searches for sentences matching the input text.
   *
   * Note: match_count is ephemeral and gets reset on each search call.
   * This is by design to prevent stale match counts from affecting new searches.
   *
   * @param search_input Text to search for
   * @param options.ranked Whether to rank results by match count (uses O(1) index lookups)
   * @param options.min_match_count Minimum number of word matches required (overrides instance setting)
   * @returns Object containing results array and finder instance for chaining
   * @see searchArray for a simpler version that returns just the results array
   */
  public search = (
    search_input: string,
    options?: { ranked?: boolean; min_match_count?: number }
  ): { results: string[]; finder: SentenceFinder } => {
    if (!search_input.trim()) return { results: [], finder: this };

    // Reset match count for new search
    this.match_count = {};
    const min_match = options?.min_match_count ?? this.min_match_count;

    const words = this.tokenizer(search_input);
    if (!words) return { results: [], finder: this };

    // Count matches for each sentence
    for (let i = 0; i < words.length; i++) {
      const key_word = this.normalize_word(words[i]);
      if (this.dictionary.has(key_word)) {
        const indexes = this.dictionary.get(key_word)!;
        for (let j = 0; j < indexes.length; j++) {
          const match_count_index = indexes[j];
          this.match_count[match_count_index] =
            (this.match_count[match_count_index] || 0) + 1;
        }
      }
    }

    const sentences: string[] = [];
    for (const [word_index, word_count] of Object.entries(this.match_count)) {
      if (word_count >= min_match) {
        sentences.push(this.collection[Number(word_index)]);
      }
    }

    if (options?.ranked) {
      sentences.sort((a, b) => {
        // Use index_map for O(1) lookup instead of indexOf
        const a_index = this.index_map.get(a)!;
        const b_index = this.index_map.get(b)!;
        return (
          (this.match_count[b_index] || 0) - (this.match_count[a_index] || 0)
        );
      });
    }

    this.emit("search", sentences.length);

    return { results: sentences, finder: this };
  };

  /**
   * Simplified search that returns just the array of matching sentences.
   * A convenience wrapper around search() for when chaining isn't needed.
   *
   * @param search_input Text to search for
   * @param options.ranked Whether to rank results by match count
   * @param options.min_match_count Minimum number of word matches required
   * @returns Array of matching sentences
   */
  public searchArray = (
    search_input: string,
    options?: { ranked?: boolean; min_match_count?: number }
  ): string[] => {
    return this.search(search_input, options).results;
  };

  /**
   * Suggests words that start with the given prefix.
   * Uses binary search on a cached sorted array for improved performance on large dictionaries.
   * The case sensitivity setting affects how the prefix is matched.
   *
   * @param prefix The prefix to search for
   * @returns Object containing suggestions array and finder instance for chaining
   *
   * Performance note: First call may sort the dictionary, subsequent calls use a cached sorted array
   * until the dictionary is modified (via init, merge, or reset).
   */
  public suggest = (
    prefix: string
  ): { suggestions: string[]; finder: SentenceFinder } => {
    if (!prefix.trim()) return { suggestions: [], finder: this };

    const norm_prefix = this.normalize_word(prefix);

    // Use cached sorted words or create and cache them
    if (!this.sorted_dictionary_cache) {
      this.sorted_dictionary_cache = Array.from(this.dictionary.keys()).sort();
    }
    const sorted_words = this.sorted_dictionary_cache;

    // Binary search for the first word that could start with the prefix
    let start = 0;
    let end = sorted_words.length;

    while (start < end) {
      const mid = Math.floor((start + end) / 2);
      if (sorted_words[mid] < norm_prefix) {
        start = mid + 1;
      } else {
        end = mid;
      }
    }

    // Collect all words that start with the prefix
    const suggestions: string[] = [];
    while (
      start < sorted_words.length &&
      sorted_words[start].startsWith(norm_prefix)
    ) {
      suggestions.push(sorted_words[start]);
      start++;
    }

    this.emit("suggest", suggestions.length);

    return { suggestions, finder: this };
  };

  /**
   * Returns the internal dictionary mapping words to their sentence indexes.
   * @returns Map where keys are words and values are arrays of sentence indexes
   */
  public getDictionary = (): Map<string, number[]> => {
    return this.dictionary;
  };

  /**
   * Returns the word frequency map showing how often each word appears.
   * @returns Map where keys are words and values are occurrence counts
   */
  public getWordFrequency = (): Map<string, number> => {
    return this.word_frequency;
  };

  /**
   * Merges another SentenceFinder instance into this one.
   *
   * @param finder The SentenceFinder instance to merge
   * @param options.deduplicate Whether to remove duplicate sentences during merge
   * @returns this for method chaining
   */
  public merge = (
    finder: SentenceFinder,
    options?: { deduplicate?: boolean }
  ): this => {
    if (!(finder instanceof SentenceFinder)) {
      throw new Error("Can only merge with another SentenceFinder instance");
    }

    const offset = this.collection.length;
    const duplicates = new Set<number>(); // Track indexes of duplicates

    // If deduplication is enabled, identify duplicates first
    if (options?.deduplicate) {
      finder.collection.forEach((sentence, i) => {
        if (this.index_map.has(sentence)) {
          duplicates.add(i);
        }
      });
    }

    // Update dictionary with new indexes, skipping duplicates
    for (const [word, indexes] of finder.dictionary.entries()) {
      const adjusted_indexes = indexes
        .filter((idx) => !duplicates.has(idx))
        .map((idx) => {
          // Adjust index based on how many duplicates come before it
          const precedingDuplicates = options?.deduplicate
            ? Array.from(duplicates).filter((d) => d < idx).length
            : 0;
          return idx + offset - precedingDuplicates;
        });

      if (this.dictionary.has(word)) {
        const existing_indexes = this.dictionary.get(word)!;
        this.dictionary.set(word, [
          ...new Set([...existing_indexes, ...adjusted_indexes]),
        ]);
      } else {
        this.dictionary.set(word, adjusted_indexes);
      }
    }

    // Update word frequencies, accounting for duplicates
    for (const [word, freq] of finder.word_frequency.entries()) {
      const duplicate_freq = options?.deduplicate
        ? finder.collection
            .filter((_, i) => duplicates.has(i))
            .filter((s) => finder.tokenizer(s).includes(word)).length
        : 0;

      this.word_frequency.set(
        word,
        (this.word_frequency.get(word) || 0) + freq - duplicate_freq
      );
    }

    // Update collection and index_map, skipping duplicates
    const new_sentences = options?.deduplicate
      ? finder.collection.filter((_, i) => !duplicates.has(i))
      : finder.collection;

    new_sentences.forEach((sentence, i) => {
      this.index_map.set(sentence, offset + i);
    });

    this.collection = [...this.collection, ...new_sentences];

    // Invalidate sorted dictionary cache since we've added new words
    this.sorted_dictionary_cache = null;

    this.emit("merge", finder.collection.length);
    return this;
  };

  public reset(): this {
    this.collection = [];
    this.dictionary.clear();
    this.word_frequency.clear();
    this.match_count = {};
    this.index_map.clear();
    this.sorted_dictionary_cache = null;
    this.emit("reset");
    return this;
  }
}

export default SentenceFinder;
