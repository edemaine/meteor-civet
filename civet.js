// Based on Meteor's CoffeeScript compiler implementation:
// https://github.com/meteor/meteor/blob/devel/packages/non-core/coffeescript-compiler/coffeescript-compiler.js
// and the compiler plugin registration pattern:
// https://github.com/meteor/meteor/blob/devel/packages/non-core/coffeescript/compile-coffeescript.js

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const Module = require('module');
const { Babel, BabelCompiler } = require('meteor/babel-compiler');
const { SourceMapConsumer, SourceMapGenerator } = require('source-map');

let Civet;
const moduleName = '@danielx/civet';
const missingCivetError = `
ERROR: edemaine:civet is missing the peer NPM dependency ${moduleName}
ERROR: Install it in your app via: meteor npm install --save-dev ${moduleName}
ERROR: Then restart meteor
`;

Plugin.registerCompiler({
  extensions: ['civet']
}, () => {
  const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
  try {
    Civet = appRequire(moduleName);
  } catch (error) {
    if (error instanceof SyntaxError) {
      try {
        const resolvedPath = appRequire.resolve(moduleName);
        const source = fs.readFileSync(resolvedPath, 'utf8');
        const babelOptions = Babel.getDefaultOptions({
          nodeMajorVersion: parseInt(process.versions.node, 10)
        });
        babelOptions.filename = resolvedPath;
        babelOptions.sourceMaps = false;
        const compiled = Babel.compile(source, babelOptions);
        const compiledModule = new Module(resolvedPath, module.parent);
        compiledModule.filename = resolvedPath;
        compiledModule.paths = Module._nodeModulePaths(path.dirname(resolvedPath));
        compiledModule._compile(compiled.code, resolvedPath);
        Civet = compiledModule.exports;
      } catch (transpileError) {
        console.error(`Failed to transpile Civet with Babel: ${transpileError.message}`);
      }
    } else {
      console.error(error.message + '\n' + missingCivetError);
    }
  }

  return new CachedCivetCompiler();
});

class CachedCivetCompiler extends CachingCompiler {
  constructor(options = {}) {
    super({
      compilerName: 'civet',
      defaultCacheSize: 1024 * 1024 * 10
    });

    this.civetCompiler = new CivetCompiler(options);
  }

  getCacheKey(inputFile) {
    return [
      inputFile.getArch(),
      inputFile.getSourceHash(),
      inputFile.getDeclaredExports(),
      inputFile.getPathInPackage(),
      this.civetCompiler.getVersion()
    ];
  }

  compileOneFileLater(inputFile, getResult) {
    inputFile.addJavaScript({
      path: this.civetCompiler.outputFilePath(inputFile),
      sourcePath: inputFile.getPathInPackage(),
      bare: inputFile.getFileOptions().bare
    }, async () => {
      const result = await getResult();
      return result && {
        data: result.source,
        sourceMap: result.sourceMap
      };
    });
  }

  compileOneFile(inputFile) {
    return this.civetCompiler.compileOneFile(inputFile);
  }

  setDiskCacheDirectory(cacheDir) {
    this.civetCompiler.setDiskCacheDirectory(cacheDir);
    return super.setDiskCacheDirectory(cacheDir);
  }

  addCompileResult(inputFile, sourceWithMap) {
    inputFile.addJavaScript({
      path: this.civetCompiler.outputFilePath(inputFile),
      sourcePath: inputFile.getPathInPackage(),
      data: sourceWithMap.source,
      sourceMap: sourceWithMap.sourceMap,
      bare: inputFile.getFileOptions().bare
    });
  }

  compileResultSize(sourceWithMap) {
    return sourceWithMap.source.length +
      this.sourceMapSize(sourceWithMap.sourceMap);
  }
}

class CivetCompiler {
  constructor() {
    this.babelCompiler = new BabelCompiler({
      runtime: false,
      react: true
    });
  }

  getVersion() {
    return Civet?.version;
  }

  outputFilePath(inputFile) {
    return inputFile.getPathInPackage();
  }

  getCompileOptions(inputFile) {
    return {
      filename: inputFile.getDisplayPath(),
      outputFilename: '/' + this.outputFilePath(inputFile),
      sourceMap: true,
      js: true,
      sync: true
    };
  }

  compileOneFile(inputFile) {
    if (!Civet) {
      inputFile.error({ message: missingCivetError });
      return null;
    }

    const source = inputFile.getContentsAsString();
    const compileOptions = this.getCompileOptions(inputFile);

    let output;
    try {
      output = Civet.compile(source, compileOptions);
    } catch (error) {
      this.reportCompileError(inputFile, error);
      return null;
    }

    if (!output) {
      return null;
    }

    const compiledSource = typeof output === 'string' ? output : output.code;
    const civetSourceMap = typeof output === 'string'
      ? null
      : this.renderSourceMap(output.sourceMap, inputFile, compileOptions);

    const babelResult = this.babelCompiler.processOneFileForTarget(
      inputFile,
      compiledSource
    );

    if (babelResult && babelResult.data != null) {
      const mergedSourceMap = this.mergeSourceMaps(
        babelResult.sourceMap,
        civetSourceMap,
        inputFile
      );
      return {
        source: babelResult.data,
        sourceMap: mergedSourceMap
      };
    }

    return {
      source: compiledSource,
      sourceMap: civetSourceMap
    };
  }

  setDiskCacheDirectory(cacheDir) {
    if (this.babelCompiler && this.babelCompiler.setDiskCacheDirectory) {
      this.babelCompiler.setDiskCacheDirectory(cacheDir);
    }
  }

  renderSourceMap(sourceMap, inputFile, compileOptions) {
    if (!sourceMap) {
      return null;
    }

    return sourceMap.json(
      inputFile.getDisplayPath(),
      compileOptions.outputFilename
    );
  }

  mergeSourceMaps(babelSourceMap, civetSourceMap, inputFile) {
    if (!babelSourceMap) {
      return civetSourceMap;
    }

    if (!civetSourceMap) {
      return babelSourceMap;
    }

    const normalizedBabelMap = {
      ...babelSourceMap,
      sources: [...babelSourceMap.sources]
    };
    normalizedBabelMap.sources[0] = '/' + this.outputFilePath(inputFile);

    const sourceMapGenerator = SourceMapGenerator.fromSourceMap(
      new SourceMapConsumer(normalizedBabelMap)
    );
    sourceMapGenerator.applySourceMap(new SourceMapConsumer(civetSourceMap));
    return sourceMapGenerator.toJSON();
  }

  reportCompileError(inputFile, error) {
    if (Civet?.isCompileError?.(error)) {
      const firstError = Array.isArray(error.errors) ? error.errors[0] : error;
      const line = toNumber(firstError.line);
      const column = toNumber(firstError.column);
      inputFile.error({
        message: firstError.message || firstError.header || 'Civet compile error',
        line,
        column
      });
      return;
    }

    inputFile.error({
      message: error && error.message ? error.message : String(error)
    });
  }
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
