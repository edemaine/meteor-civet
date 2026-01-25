import { civetAdd, civetAnswer } from './civet_test.civet'

Tinytest.add('edemaine:civet - compiles civet files', (test) => {
  test.equal(civetAnswer, 42)
  test.equal(civetAdd(1, 2), 3)
})
