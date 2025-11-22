export interface SentenceFinderOptions {
  min_match_count?: number;
  case_sensitive?: boolean;
  tokenizer?: (text: string) => string[];
  strict_tokens?: boolean;
}

type EventName = 'init' | 'search' | 'suggest' | 'merge' | 'reset';

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
  private index_map: Map<string, number>;
  private sorted_dictionary_cache: string[] | null = null;

  public min_match_count: number;
  public tokenizer: (text: string) => string[];
  public case_sensitive: boolean;
  public events: { [K in EventName]: EventListenerMap[K][] };

  constructor({
    min_match_count = 1,
    case_sensitive = false,
    tokenizer,
    strict_tokens = false,
  }: SentenceFinderOptions = {}) {
    this.dictionary = new Map();
    this.word_frequency = new Map();
    this.collection = [];
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
    this.tokenizer = tokenizer || (strict_tokens ? this.strict_tokenizer : this.default_tokenizer);
  }

  private default_tokenizer = (text: string): string[] => {
    return text
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map((w) => (this.case_sensitive ? w : w.toLowerCase()));
  };

  private strict_tokenizer = (text: string): string[] => {
    return text
      .replace(/\s+/g, ' ')
      .split(/(?<![\p{L}\p{N}'-])(?![\p{L}\p{N}'-])|(?<=[^\p{L}\p{N}'-])(?=[\p{L}\p{N}'-])/u)
      .map((token) => token.trim())
      .filter(Boolean)
      .map((w) => (this.case_sensitive ? w : w.toLowerCase()));
  };

  private normalize_word = (word: string): string => {
    return this.case_sensitive ? word : word.toLowerCase();
  };

  public on = <K extends EventName>(event: K, listener: EventListenerMap[K]): this => {
    this.events[event].push(listener);
    return this;
  };

  public emit = <K extends EventName>(event: K, ...args: Parameters<EventListenerMap[K]>): this => {
    const listeners = this.events[event];
    for (const listener of listeners) {
      (listener as (...args: unknown[]) => void)(...args);
    }
    return this;
  };

  public init = (input: string[]): this => {
    if (!Array.isArray(input)) throw new Error('Input must be an array');

    this.collection = [...input];
    this.dictionary.clear();
    this.word_frequency.clear();
    this.index_map.clear();
    this.sorted_dictionary_cache = null;

    for (let i = 0; i < input.length; i++) {
      this.index_map.set(input[i], i);
      const words = this.tokenizer(input[i]);
      for (const word of words) {
        const key_word = this.normalize_word(word); // <-- normalize here
        if (!this.dictionary.has(key_word)) {
          this.dictionary.set(key_word, []);
        }
        this.dictionary.get(key_word)!.push(i);

        this.word_frequency.set(key_word, (this.word_frequency.get(key_word) || 0) + 1);
      }
    }

    this.emit('init', this.collection.length);
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
    options?: { ranked?: boolean; min_match_count?: number; partial?: boolean },
  ): { results: string[]; finder: SentenceFinder } => {
    if (!search_input.trim()) return { results: [], finder: this };

    const min_match = options?.min_match_count ?? this.min_match_count;
    const tokens = this.tokenizer(search_input).map(this.normalize_word);
    if (tokens.length === 0) return { results: [], finder: this };

    const sentence_matches: Map<number, Set<string>> = new Map();
    const partial = options?.partial ?? false;

    for (const token of tokens) {
      if (partial) {
        for (const [dictWord, indexes] of this.dictionary.entries()) {
          if (dictWord.includes(token)) {
            for (const idx of indexes) {
              if (!sentence_matches.has(idx)) sentence_matches.set(idx, new Set());
              sentence_matches.get(idx)!.add(token);
            }
          }
        }
      } else {
        // Exact match
        if (this.dictionary.has(token)) {
          for (const idx of this.dictionary.get(token)!) {
            if (!sentence_matches.has(idx)) sentence_matches.set(idx, new Set());
            sentence_matches.get(idx)!.add(token);
          }
        } else {
          // Fallback: match words that start with the token (prefix match)
          for (const [dictWord, indexes] of this.dictionary.entries()) {
            if (dictWord.startsWith(token)) {
              for (const idx of indexes) {
                if (!sentence_matches.has(idx)) sentence_matches.set(idx, new Set());
                sentence_matches.get(idx)!.add(token);
              }
            }
          }
        }
      }
    }

    // Filter sentences with matched tokens >= min_match
    const results: string[] = [];
    for (const [idx, tokensSet] of sentence_matches.entries()) {
      if (tokensSet.size >= min_match) results.push(this.collection[idx]);
    }

    // Rank results if needed
    if (options?.ranked) {
      // Compute a score per sentence: number of occurrences of the search tokens in the sentence
      const scoreMap: Map<number, number> = new Map();
      const earliestMatchMap: Map<number, number> = new Map();
      for (const [idx] of sentence_matches.entries()) {
        scoreMap.set(idx, 0);
        earliestMatchMap.set(idx, Number.POSITIVE_INFINITY);
      }
      for (const token of tokens) {
        for (const [idx] of sentence_matches.entries()) {
          // Count occurrences of token as substring in the sentence tokens
          const sentenceTokens = this.tokenizer(this.collection[idx]).map(this.normalize_word);
          let occ = 0;
          for (let tI = 0; tI < sentenceTokens.length; tI++) {
            const st = sentenceTokens[tI];
            let pos = 0;
            let localOcc = 0;
            while (true) {
              const found = st.indexOf(token, pos);
              if (found === -1) break;
              // Weight exact matches higher than prefix/substring matches
              if (st === token) {
                localOcc += 10; // strong preference for exact word match
              } else if (st.startsWith(token)) {
                localOcc += 2; // prefix match
              } else {
                localOcc += 1; // substring match
              }
              pos = found + token.length;
            }
            if (localOcc > 0) {
              occ += localOcc;
              // record earliest match position
              earliestMatchMap.set(idx, Math.min(earliestMatchMap.get(idx)!, tI));
            }
          }
          scoreMap.set(idx, (scoreMap.get(idx) || 0) + occ);
        }
      }

      results.sort((a, b) => {
        const aIndex = this.index_map.get(a)!;
        const bIndex = this.index_map.get(b)!;
        const aScore = scoreMap.get(aIndex) ?? 0;
        const bScore = scoreMap.get(bIndex) ?? 0;
        if (bScore !== aScore) return bScore - aScore;
        // Tie-breaker: prefer sentence where match appears earlier in token order
        const aEarliest = earliestMatchMap.get(aIndex) ?? Number.POSITIVE_INFINITY;
        const bEarliest = earliestMatchMap.get(bIndex) ?? Number.POSITIVE_INFINITY;
        if (aEarliest !== bEarliest) return aEarliest - bEarliest;
        // Final tie-breaker: lower original index first
        return (this.index_map.get(a) ?? 0) - (this.index_map.get(b) ?? 0);
      });
    }

    this.emit('search', results.length);
    return { results, finder: this };
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
    options?: { ranked?: boolean; min_match_count?: number; partial?: boolean },
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
  public suggest = (prefix: string): { suggestions: string[]; finder: SentenceFinder } => {
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
    while (start < sorted_words.length && sorted_words[start].startsWith(norm_prefix)) {
      suggestions.push(sorted_words[start]);
      start++;
    }

    this.emit('suggest', suggestions.length);

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
  public merge = (finder: SentenceFinder, options?: { deduplicate?: boolean }): this => {
    if (!(finder instanceof SentenceFinder)) {
      throw new Error('Can only merge with another SentenceFinder instance');
    }

    const offset = this.collection.length;
    let newSentences: string[];
    if (options?.deduplicate) {
      const existing = new Set(this.collection);
      newSentences = finder.collection.filter((s) => !existing.has(s));
    } else {
      newSentences = finder.collection;
    }

    // Update dictionary and word frequencies
    for (const [word, indexes] of finder.dictionary.entries()) {
      const adjusted_indexes = indexes
        .filter((idx) => !options?.deduplicate || newSentences.includes(finder.collection[idx]))
        .map((idx) => idx + offset);
      if (this.dictionary.has(word)) {
        const existingIndexes = this.dictionary.get(word)!;
        this.dictionary.set(word, [...new Set([...existingIndexes, ...adjusted_indexes])]);
      } else {
        this.dictionary.set(word, adjusted_indexes);
      }
    }
    for (const [word, freq] of finder.word_frequency.entries()) {
      let addFreq = 0;
      if (options?.deduplicate) {
        // Only count frequency for new sentences
        for (const s of newSentences) {
          const tokens = finder.tokenizer(s).map(this.normalize_word);
          if (tokens.includes(word)) addFreq++;
        }
      } else {
        addFreq = freq;
      }
      this.word_frequency.set(word, (this.word_frequency.get(word) || 0) + addFreq);
    }
    // Update index_map and collection
    newSentences.forEach((sentence, i) => {
      this.index_map.set(sentence, offset + i);
    });
    this.collection = [...this.collection, ...newSentences];
    this.sorted_dictionary_cache = null;
    this.emit('merge', finder.collection.length);
    return this;
  };

  public reset(): this {
    this.collection = [];
    this.dictionary.clear();
    this.word_frequency.clear();
    this.index_map.clear();
    this.sorted_dictionary_cache = null;
    this.emit('reset');
    return this;
  }
}

export default SentenceFinder;
