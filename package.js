const versions = {
  2: '0.0.4',
  3: '1.0.4',
}

const meteorVersion = process.env.METEOR_VERSION || '3'
const version = versions[meteorVersion]

if (!version) {
  throw new Error(`Unknown METEOR_VERSION="${meteorVersion}". Use 2 or 3.`)
}

Package.describe({
  name: 'edemaine:civet',
  summary: 'Civet language support for Meteor',
  version,
})

Package.registerBuildPlugin({
  name: 'civet',
  use: ['caching-compiler@1.2.1||2.0.1', 'babel-compiler@7.6.2', 'ecmascript@0.12.7'],
  sources: ['civet.js'],
  npmDependencies: {
    'source-map': '0.5.7'
  },
})

Package.onUse(function (api) {
  api.versionsFrom(['2.3', '3.0'])
  api.use('isobuild:compiler-plugin@1.0.0')
  api.imply('ecmascript-runtime')
  api.imply('babel-runtime')
  api.imply('promise')
  api.imply('dynamic-import')
})

Package.onTest(function (api) {
  api.use('edemaine:civet')
  api.use(['ecmascript', 'modules', 'tinytest', 'underscore'])
  api.addFiles('tests/civet_test.civet', ['client', 'server'])
  api.addFiles('tests/civet_tests.js', ['client', 'server'])
})
