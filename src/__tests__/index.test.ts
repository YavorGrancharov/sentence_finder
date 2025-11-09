import { SentenceFinder } from '../index';

describe('SentenceFinder', () => {
  let finder: SentenceFinder;

  beforeEach(() => {
    finder = new SentenceFinder();
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
      const caseSensitive = new SentenceFinder({ case_sensitive: true })
        .init(['Test sentence', 'test different']);
      
      expect(caseSensitive.searchArray('Test')).toHaveLength(1);
      expect(caseSensitive.searchArray('test')).toHaveLength(1);
    });
  });

  describe('strict tokenization', () => {
    it('should handle hyphenated words correctly in strict mode', () => {
      const finder = new SentenceFinder({ strict_tokens: true })
        .init(['hi-tech solution', 'high tech answer']);
      
      expect(finder.searchArray('hi-tech')).toHaveLength(1);
      expect(finder.searchArray('high tech')).toHaveLength(1);
    });
  });
});