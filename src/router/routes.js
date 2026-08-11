/**
 * 路由定义 —— 单一来源，被 `router/index.js` 聚合后注入 `createRouter`。
 *
 * 当前里程碑（M1）仅注册占位组件；M2 之后填充实际 UI。
 *
 * 路由策略见设计文档 §4：仅承担页面切换，无 Tab 状态需要持久化。
 */

const routes = [
  {
    path: '/',
    name: 'entry',
    component: () => import('@/views/EntryView.jsx'),
    meta: { title: 'inkwell · 入口' },
  },
  {
    path: '/editor',
    name: 'editor',
    component: () => import('@/views/EditorView.jsx'),
    meta: { title: 'inkwell · 编辑器' },
  },
  // 未匹配路径重定向到入口
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

export default routes;
