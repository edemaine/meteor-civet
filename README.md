# edemaine:civet

## Civet in Meteor

This [Meteor](https://www.meteor.com/) package lets you write code in
[Civet](https://civet.dev/) in `.civet` files, and automatically compiles
them to JavaScript.

## Installation

```bash
meteor add edemaine:civet
meteor npm install --save-dev @danielx/civet
```

Note that the Civet compiler `@danielx/civet` is a
[peer NPM dependency](https://guide.meteor.com/using-atmosphere-packages.html#peer-npm-dependencies),
so that you can control which version to install.
But that means you need to install it yourself.

## References

This implementation is based on Meteor's CoffeeScript compiler,
which is [MIT licensed](https://github.com/meteor/meteor/blob/devel/LICENSE):

- https://github.com/meteor/meteor/blob/devel/packages/non-core/coffeescript-compiler/coffeescript-compiler.js
- https://github.com/meteor/meteor/blob/devel/packages/non-core/coffeescript/compile-coffeescript.js

## Testing

```bash
npm install
meteor test-packages ./
```

## Future Work

Civet actually supports (and compiles to) TypeScript.
Ideally we would integrate with Meteor's TypeScript support, such as
[zodern:types](https://github.com/zodern/meteor-types).
