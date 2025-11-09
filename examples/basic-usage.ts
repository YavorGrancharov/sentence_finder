import { SentenceFinder } from '../src';

// Create a new finder with strict tokenization
const finder = new SentenceFinder({
  strict_tokens: true,
  min_match_count: 2
});

// Initialize with some sentences
finder
  .init([
    'The quick brown fox jumps over the lazy dog',
    'Quick foxes are known for jumping',
    'Dogs are usually lazy in the afternoon'
  ])
  .on('search', count => console.log(`Found ${count} matches`));

// Perform a search
const { results } = finder.search('fox jump', { ranked: true });
console.log('Search results:', results);

// Get suggestions
const { suggestions } = finder.suggest('qu');
console.log('Word suggestions:', suggestions);

// Get word frequencies
const frequencies = finder.getWordFrequency();
console.log('Word frequencies:', Object.fromEntries(frequencies));