export const curatedTests = {
  'intro-add': [
    { args: [1, 2], expected: 3 },
    { args: [-10, 15], expected: 5 },
    { args: [0, 0], expected: 0 },
  ],
  'intro-centuryfromyear': [
    { args: [1905], expected: 20 },
    { args: [1700], expected: 17 },
    { args: [2001], expected: 21 },
  ],
  'intro-checkpalindrome': [
    { args: ['aabaa'], expected: true },
    { args: ['abac'], expected: false },
    { args: ['a'], expected: true },
  ],
  'intro-adjacentelementsproduct': [
    { args: [[3, 6, -2, -5, 7, 3]], expected: 21 },
    { args: [[-1, -2]], expected: 2 },
    { args: [[5, 1, 2, 3, 1, 4]], expected: 6 },
  ],
  'intro-shapearea': [
    { args: [1], expected: 1 },
    { args: [2], expected: 5 },
    { args: [5], expected: 41 },
  ],
  'intro-makearrayconsecutive': [
    { args: [[6, 2, 3, 8]], expected: 3 },
    { args: [[0, 3]], expected: 2 },
    { args: [[5, 4, 6]], expected: 0 },
  ],
  'intro-almostincreasingsequence': [
    { args: [[1, 3, 2, 1]], expected: false },
    { args: [[1, 3, 2]], expected: true },
    { args: [[1, 2, 3, 4, 3, 6]], expected: true },
  ],
  'intro-alllongeststrings': [
    { args: [['aba', 'aa', 'ad', 'vcd', 'aba']], expected: ['aba', 'vcd', 'aba'] },
    { args: [['a']], expected: ['a'] },
    { args: [['abc', 'eeee', 'abcd', 'dcd']], expected: ['eeee', 'abcd'] },
  ],
  'intro-commoncharactercount': [
    { args: ['aabcc', 'adcaa'], expected: 3 },
    { args: ['zzzz', 'zzzzzzz'], expected: 4 },
    { args: ['abca', 'xyzbac'], expected: 3 },
  ],
  'intro-islucky': [
    { args: [1230], expected: true },
    { args: [239017], expected: false },
    { args: [134008], expected: true },
  ],
  'intro-sortbyheight': [
    { args: [[-1, 150, 190, 170, -1, -1, 160, 180]], expected: [-1, 150, 160, 170, -1, -1, 180, 190] },
    { args: [[-1, -1, -1]], expected: [-1, -1, -1] },
    { args: [[4, 2, 9, 11, 2, 16]], expected: [2, 2, 4, 9, 11, 16] },
  ],
  'intro-alternatingsums': [
    { args: [[50, 60, 60, 45, 70]], expected: [180, 105] },
    { args: [[100, 50]], expected: [100, 50] },
    { args: [[80]], expected: [80, 0] },
  ],
  'intro-areequallystrong': [
    { args: [10, 15, 15, 10], expected: true },
    { args: [15, 10, 15, 10], expected: true },
    { args: [15, 10, 15, 9], expected: false },
  ],
  'intro-arraymaxconsecutivesum': [
    { args: [[2, 3, 5, 1, 6], 2], expected: 8 },
    { args: [[1, 3, 2, 4], 3], expected: 9 },
    { args: [[1, 1, 1, 1], 1], expected: 1 },
  ],
  'intro-even digitsonly': [],
  'intro-reverseinparenthesis': [
    { args: ['(bar)'], expected: 'rab' },
    { args: ['foo(bar)baz'], expected: 'foorabbaz' },
    { args: ['foo(bar(baz))blim'], expected: 'foobazrabblim' },
  ],
  'interviewpractices-firstduplicate': [
    { args: [[2, 1, 3, 5, 3, 2]], expected: 3 },
    { args: [[2, 2]], expected: 2 },
    { args: [[2, 4, 3, 5, 1]], expected: -1 },
  ],
  'interviewpractices-containsduplicates': [
    { args: [[1, 2, 3, 1]], expected: true },
    { args: [[1, 2, 3, 4]], expected: false },
    { args: [[]], expected: false },
  ],
  'interviewpractices-firstnotrepeatingcharacter': [
    { args: ['abacabad'], expected: 'c' },
    { args: ['abacabaabacaba'], expected: '_' },
    { args: ['z'], expected: 'z' },
  ],
  'interviewpractices-sumofTwo': [],
};
