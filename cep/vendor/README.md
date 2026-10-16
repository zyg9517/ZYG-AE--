# Adobe CEP 9 SDK sources

These files are unchanged downloads from the official
[Adobe-CEP/CEP-Resources](https://github.com/Adobe-CEP/CEP-Resources) repository,
pinned to commit `e6a415509d021a15e1fc5daeaa60fb5fcf2a0dd1`, directory `CEP_9.x`.
Both identify themselves as SDK version **v9.4.0**, from the CEP 9 release family
used by After Effects 2020. Original Adobe copyright/license notices are retained.

| File | Official source | SHA-256 (download bytes) |
| --- | --- | --- |
| CSInterface.js | [Pinned source](https://github.com/Adobe-CEP/CEP-Resources/blob/e6a415509d021a15e1fc5daeaa60fb5fcf2a0dd1/CEP_9.x/CSInterface.js) | `a8c3a0dc2b2c60b29df36eb4b4ffd7f9819c70309c2b6105da9a2b848c348e78` |
| CEPEngine_extensions.js | [Pinned source](https://github.com/Adobe-CEP/CEP-Resources/blob/e6a415509d021a15e1fc5daeaa60fb5fcf2a0dd1/CEP_9.x/CEPEngine_extensions.js) | `3e46c4cff687fa5194dee5cab9e2fd6fc6f9547d5e0c079f52ce578f60c8f7db` |

`CSInterface.js` is loaded by the panel. `CEPEngine_extensions.js` is the SDK
reference for CEP's built-in `cep` native APIs; it contains `native function`
declarations and must not be loaded as an ordinary HTML script.

In `CEPEngine_extensions.js`, lines 423–445 document `createProcess` as the full
executable path followed by its argument values. The wrapper copies JavaScript
arguments into an array and passes it to native `CreateProcess(args)`, returning
`{data: pid, err: getLastError()}`; `data` is `-1` on failure. The SDK does not
specify an additional quoting layer. `path-actions.js` therefore passes
`C:\Windows\explorer.exe` and the folder as two separate arguments, preserving
spaces, quotes, ampersands and Unicode without a shell or added quotation marks.
Automated tests verify this boundary and returned success/error behavior;
native Explorer interpretation remains part of the AE/CEP runtime smoke test.

`CSInterface.js`, lines 32–33 and 604–618, documents the native evalScript failure
sentinel `EvalScript error.`, handled separately from host JSON protocol errors.
