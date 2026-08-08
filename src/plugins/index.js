import naive from './naive.js';

/**
 * 第三方组件 / 插件统一入口。
 *
 * 新增第三方组件时：在本目录下新建一个文件（如 `xxx.js`）导出 Vue 插件，
 * 然后把它追加到 `plugins` 数组即可。`main.js` 始终只需要调用
 * `installPlugins(app)`，无需关心具体清单。
 */
export const plugins = [naive];

export function installPlugins(app) {
  for (const plugin of plugins) {
    app.use(plugin);
  }
}
