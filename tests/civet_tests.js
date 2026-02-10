import { civetAdd, civetAnswer, civetBool, getAnswer } from './civet_test'

Tinytest.add('edemaine:civet - compiles civet files', (test) => {
  test.equal(civetAnswer, 42)
  test.equal(getAnswer(), 42)
  test.equal(civetBool, true)
  test.equal(civetAdd(1, 2), 3)
})
