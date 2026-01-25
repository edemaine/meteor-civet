Package.describe({
  name: 'edemaine:civet',
  summary: 'Civet language support for Meteor',
  version: '0.1.0'
});

Package.registerBuildPlugin({
  name: 'compile-civet',
  use: ['caching-compiler@2.0.1', 'babel-compiler', 'ecmascript'],
  sources: ['compile-civet.js'],
  npmDependencies: {
    'source-map': '0.5.7'
  }
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
  api.use('modules');
  api.use('tmeasday:check-npm-versions@2.1.0');
  api.imply('ecmascript-runtime');
  api.imply('babel-runtime');
  api.imply('promise');
  api.imply('dynamic-import');
  api.mainModule('check-npm.js', 'server');
});

Package.onTest(function (api) {
  api.use('edemaine:civet');
  api.use(['ecmascript', 'modules', 'tinytest', 'underscore']);
  api.addFiles('tests/civet_test.civet', ['client', 'server']);
  api.addFiles('tests/civet_tests.js', ['client', 'server']);
});
