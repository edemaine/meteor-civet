import { civetAdd, civetAnswer, civetBool } from './civet_test.civet'

Tinytest.add('edemaine:civet - compiles civet files', (test) => {
  test.equal(civetAnswer, 42)
  test.equal(civetBool, true)
  test.equal(civetAdd(1, 2), 3)
})
