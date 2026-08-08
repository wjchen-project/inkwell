import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from '@/App.jsx';
import router from '@/router';
import { installPlugins } from '@/plugins';
import { useSettingsStore, hydrateSettings } from '@/stores/useSettingsStore';
import '@/styles/index.css';

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.use(router);
installPlugins(app);

// 启动恢复：先读 localStorage，再激活 store / 注册持久化订阅。
hydrateSettings(pinia);
useSettingsStore(pinia).installPersistence();

app.mount('#app');
