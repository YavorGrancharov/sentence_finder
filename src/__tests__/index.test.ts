import { SentenceFinder } from '../index';

describe('SentenceFinder', () => {
  let finder: SentenceFinder;

  beforeEach(() => {
    finder = new SentenceFinder({ min_match_count: 1, strict_tokens: true });
  });

  describe('basic functionality', () => {
    it('should initialize with sentences', () => {
      const sentences = ['test sentence one', 'test sentence two'];
      finder.init(sentences);
      expect(finder.searchArray('test')).toEqual(sentences);
    });

    it('should handle empty input', () => {
      expect(finder.searchArray('')).toEqual([]);
    });
  });

  describe('search functionality', () => {
    beforeEach(() => {
      finder.init([
        'The quick brown fox jumps over the lazy dog',
        'Quick foxes are known for jumping',
        'Dogs are usually lazy in the afternoon',
      ]);
    });

    it('should find sentences with matching words', () => {
      const results = finder.searchArray('fox jump');
      expect(results).toContain('The quick brown fox jumps over the lazy dog');
      expect(results).toContain('Quick foxes are known for jumping');
    });

    it('should respect min_match_count', () => {
      const { results } = finder.search('quick fox lazy', { min_match_count: 2 });
      expect(results).toContain('The quick brown fox jumps over the lazy dog');
    });

    it('should rank results correctly', () => {
      const { results } = finder.search('fox jump', { ranked: true });
      expect(results[0]).toBe('The quick brown fox jumps over the lazy dog');
    });
  });

  describe('suggestions', () => {
    beforeEach(() => {
      finder.init(['quick', 'quicker', 'quickly']);
    });

    it('should suggest words with matching prefix', () => {
      const { suggestions } = finder.suggest('qui');
      expect(suggestions).toContain('quick');
      expect(suggestions).toContain('quicker');
      expect(suggestions).toContain('quickly');
    });

    it('should return empty array for empty prefix', () => {
      const { suggestions } = finder.suggest('');
      expect(suggestions).toEqual([]);
    });
  });

  describe('merge functionality', () => {
    it('should merge two finders with deduplication', () => {
      const finder1 = new SentenceFinder().init(['common sentence', 'unique one']);
      const finder2 = new SentenceFinder().init(['common sentence', 'unique two']);

      finder1.merge(finder2, { deduplicate: true });
      const results = finder1.searchArray('sentence');
      expect(results).toHaveLength(1);
      expect(results).toContain('common sentence');
    });
  });

  describe('case sensitivity', () => {
    it('should respect case sensitivity setting', () => {
      const caseSensitive = new SentenceFinder({ case_sensitive: true }).init([
        'Test sentence',
        'test different',
      ]);

      expect(caseSensitive.searchArray('Test')).toHaveLength(1);
      expect(caseSensitive.searchArray('test')).toHaveLength(1);
    });
  });

  describe('strict tokenization', () => {
    it('should handle hyphenated words correctly in strict mode', () => {
      const finder = new SentenceFinder({ strict_tokens: true }).init([
        'hi-tech solution',
        'high tech answer',
      ]);

      expect(finder.searchArray('hi-tech')).toHaveLength(1);
      expect(finder.searchArray('high tech')).toHaveLength(1);
    });
  });

  describe('partial word search', () => {
    beforeEach(() => {
      finder = new SentenceFinder().init([
        'The irradiance level is high',
        'Minimum radiation threshold reached',
        'Irrigation system requires maintenance',
        'Random unrelated sentence',
      ]);
    });

    it('should match substrings inside words', () => {
      const results = finder.searchArray('irr', { partial: true });
      expect(results).toContain('The irradiance level is high');
      expect(results).toContain('Irrigation system requires maintenance');

      // Should NOT match unrelated
      expect(results).not.toContain('Random unrelated sentence');
    });

    it('should match partial search anywhere in words', () => {
      const results = finder.searchArray('dia', { partial: true });
      expect(results).toContain('The irradiance level is high');
    });

    it('should match multiple partial tokens', () => {
      const results = finder.searchArray('irr main', { partial: true });
      expect(results).toContain('Irrigation system requires maintenance');
    });

    it('should still respect min_match_count for partial search', () => {
      const { results } = finder.search('irr di', { min_match_count: 2, partial: true });

      // Both substrings must match same sentence
      expect(results).toContain('The irradiance level is high');
    });

    it('should return empty results if no partial matches', () => {
      const results = finder.searchArray('xyz', { partial: true });
      expect(results).toEqual([]);
    });

    it('should work with ranked results in partial mode', () => {
      const { results } = finder.search('irr', { ranked: true, partial: true });

      // Irradiance and Irrigation both match;
      // the one containing more matches should be first.
      expect(results[0]).toBe('Irrigation system requires maintenance');
    });
  });
});
