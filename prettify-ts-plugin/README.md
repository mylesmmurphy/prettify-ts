# Prettify TypeScript plugin

This plugin helps your TypeScript development experience by providing hover information for TypeScript types formatted in a more readable way. The easiest way to get set up is with the [VSCode Prettify TypeScript](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts) extension.

If you don't use VSCod or otherwise want to use the plugin directly, you must first install this plugin:

- NPM: `npm install --save-dev prettify-ts-plugin`
- Yarn: `yarn add --dev prettify-ts-plugin`
- PNPM: `pnpm add --save-dev prettify-ts-plugin`

To enable the plugin, add the following to your `tsconfig.json` file:

```json
{
    "compiledOptions": {
        "plugins": [
            {
                "name": "prettify-ts-plugin"
            }
        ]
    }
}
```
