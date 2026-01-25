# edemaine:civet

Compile `.civet` files in Meteor apps using Civet.

## Install

```bash
meteor add edemaine:civet
meteor npm install --save-dev @danielx/civet
```

## Notes

- Civet is a peer npm dependency so you control its version.
- Compiled output is run through Meteor's Babel compiler for browser targets.

## References

- Meteor CoffeeScript compiler (basis for this compiler flow):
  https://github.com/meteor/meteor/blob/devel/packages/non-core/coffeescript-compiler/coffeescript-compiler.js
- Meteor CoffeeScript compiler plugin registration:
  https://github.com/meteor/meteor/blob/devel/packages/non-core/coffeescript/compile-coffeescript.js

## Test

```bash
meteor test-packages ./
```
