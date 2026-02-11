# edemaine:civet

## Civet in Meteor

This [Meteor](https://www.meteor.com/) package lets you write code in
[Civet](https://civet.dev/) in `.civet` files, and automatically compiles
them to JavaScript.

For context:

* [Civet](https://civet.dev/) is a modern successor to CoffeeScript
  that is roughly a superset of TypeScript,
  plus many other features and syntax, and
  which compiles to TypeScript/JavaScript.
* [Meteor](https://www.meteor.com/) is an (aging)
  full-stack JavaScript framework with powerful real-time data synchronization.
  I use it to build [Cosuite](https://github.com/edemaine/cosuite).

## Installation

```bash
meteor add edemaine:civet
meteor npm install --save-dev @danielx/civet
```

Note that the Civet compiler `@danielx/civet` is a
[peer NPM dependency](https://guide.meteor.com/using-atmosphere-packages.html#peer-npm-dependencies),
so that you can control which version to install.
But that means you need to install it yourself.

This package offers broad compatibility with Meteor versions 2 and 3.
In particular, for older Meteor releases that ship an older Node.js,
Babel transpiles the Civet compiler itself,
so that it runs despite modern JavaScript syntax.

## Details

* Automatically enables
  [`comptime` blocks](https://civet.dev/reference#comptime-blocks)
* Uses Civet's built-in TypeScript-to-JavaScript compilation.
  This supports most but not all TypeScript features.

## Example

For an example Meteor app using Civet, see
[meteor-civet-test-react](https://github.com/edemaine/meteor-civet-test-react).

## Babel Customization Protocol

`edemaine:civet` supports a lightweight protocol for Meteor compiler plugins
to customize the use of `BabelCompiler`.
For example, [`edemaine:solid`](https://github.com/edemaine/meteor-solid)
uses this protocol to conditionally switch from React to Solid JSX transforms.
In particular, this allows `edemaine:civet` and `edemaine:solid` to be used
together to support `.civet` files with Solid JSX.

The protocol is defined by two optional properties on `Meteor`:

* `Meteor.babelFeatures`: object merged into the `extraFeatures` argument
  passed to `new BabelCompiler(...)`
* `Meteor.modifyBabelConfig(babelOptions, inputFile)`: callback for mutating
  Babel options on a per-file basis

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

## Release Process

* v0.x.x releases are for Meteor 2
* v1.x.x releases are for Meteor 3

1. Increment both version tracks in `package.js`.
2. `git commit -a`
3. `npm run publish`, or separately:
   * `npm run publish:2` to release for Meteor 2
   * `npm run publish:3` to release for Meteor 3

## Future Work

Civet actually supports (and compiles to) TypeScript.
Ideally we would integrate with Meteor's TypeScript support, such as
[zodern:types](https://github.com/zodern/meteor-types).
