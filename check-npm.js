// Peer dependency checks based on Meteor's check-npm-versions guidance:
// https://guide.meteor.com/writing-atmosphere-packages.html#peer-npm-dependencies

const { checkNpmVersions } = require('meteor/tmeasday:check-npm-versions');
const { Meteor } = require('meteor/meteor');

if (!Meteor.isTest) {
  checkNpmVersions({
    '@danielx/civet': '>=0.0.0'
  }, 'edemaine:civet');
}
