import { ref, watch, onBeforeUnmount, toRef } from 'vue';
import { useEditorStore } from '@/stores/useEditorStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useFileSystem } from '@/composables/useFileSystem';

/**
 * 外部修改检测 composable —— 设计文档 §6.3 / M7 §3.2 / Phase 3 §4.2。
 *
 * 职责：
 * - 每 N 秒（`useSettingsStore.externalWatchInterval`，默认 10s）轮询当前打开文件的
 *   `lastModified` 元信息；窗口 focus 时也立即检查一次（F-EM-11）。
 * - baseline（`useEditorStore.lastExternalModified`）由「自我写入」路径在 store
 *   中维护：
 *   - `useFileSystem.openFile` 返回 `lastModified`，`EntryView` 调用
 *     `editorStore.loadFromFile({ lastModified })` 建立打开瞬间的基线。
 *   - 每次成功写入（自动保存 / 手动保存 / 另存为）由 `saveFile` / `saveAsFile`
 *     返回 `lastModified`，调用方通过 `editorStore.markSaved({ content, lastModified })`
 *     推进基线，杜绝「把自我写入误判为外部修改」。
 *   - 外部轮询自动重载 `reloadFromHandle` 同样把 baseline 推进到刚读到的 mtime。
 *   - 即便某条路径漏传 `lastModified`，`checkNow` 首轮兜底仍能从盘面建立基线。
 *   · 这些 baseline 全在 store 里维护，让单一真相源就能覆盖所有写入路径，
 *     watcher 不再需要任何「同步回调」hook。
 * - 检测到 lastModified 变化：
 *   - `dirty === false` → 静默自动重载（`editorStore.markSaved({content, lastModified})`）
 *     · vditor 通过 VditorEditor 自身的 `watch(value)` → `vditor.setValue` 自动同步
 *   - `dirty === true && externalState === 'clean'` → 弹 ExternalChangeDialog
 *   - `dirty === true && externalState === 'pending'` → 不弹窗（§9 #13），
 *     由下次保存触发「外部已被修改，继续保存将覆盖外部内容？」二次确认
 *
 * 状态机（Phase 3 §4.3 + M7 §3.4）：
 *   clean     默认；下次有变化按 dirty 决定自动重载/弹窗
 *   pending   「保留 / 稍后」后置位；下次轮询即使有变化也不弹窗，由下次保存触发
 *             二次确认；reload 回到 clean；loadFromFile / reset 清零
 *   orphaned  M8 写入；本 composable 不主动产生
 *
 * 错误处理：
 *   - `getMetadata` 抛错 → 静默 + console.debug（M7 §4.2 决议，M8 处理外部异常）
 *   - 文件内容读取（reload）抛错 → console.warn + 状态保留
 *
 * 关闭开关：
 *   - `useSettingsStore.externalWatchEnabled === false` → 不轮询、不 focus 触发；
 *     设置再次开启后重启轮询（立即 checkNow 一次）
 *
 * handleRef 变化（如「另存为」产生新句柄 / 新建文档 → reset → fileHandle = null）：
 *   - 由内部 `watch(handleRef, ..., { immediate: true })` 自动重启 / 停止；
 *     EditorView 不需要手动调用 startWatch / stopWatch。
 *   - baseline 由 loadFromFile / markSaved 维护，watcher 不主动重置；
 *     handle 由有效句柄变成 null 时清掉，避免脏值飘到下一个文件上。
 *
 * 调用约束：
 *   - 必须在组件 `setup()` 中调用（需要 `onBeforeUnmount`）。
 *   - 仅在 `fileHandle !== null` 时实际轮询；handleRef 为 null 时立即停。
 *
 * @param { import('vue').Ref<FileSystemFileHandle | null> } handleRef
 * @returns {{
 *   externalState: import('vue').Ref<'clean' | 'pending' | 'orphaned'>,
 *   showDialog: import('vue').Ref<boolean>,
 *   handleDialogResolve: (choice: 'keep' | 'reload' | 'later') => Promise<void>,
 *   startWatch: () => void,
 *   stopWatch: () => void,
 *   checkNow: () => Promise<void>,
 * }}
 */
export function useExternalWatcher(handleRef) {
  const editorStore = useEditorStore();
  const settingsStore = useSettingsStore();
  const fileSystem = useFileSystem();

  // 对话框显隐：仅本组件作用域使用，不入 store
  const showDialog = ref(false);

  // ────────── 内部状态 ──────────
  /** @type {ReturnType<typeof setInterval> | null} */
  let intervalId = null;
  /** 防止 checkNow 并发：focus + interval 同时触发时只跑一次 */
  let checking = false;
  // 注意：`lastExternalModified` 不再是 watcher 内部的局部变量，而是
  // 存放在 `useEditorStore` 中（字段已声明）。这样所有「自我写入」路径
  // （useAutoSave / TitleBar / useSaveAs）通过 `markSaved({ lastModified })`
  // 自动同步 baseline，无需调用方记着通知 watcher；同理 `loadFromFile`
  // 在打开文件时一次性把 baseline 落到 store。

  /**
   * 把当前 handle 的内容读到 store。`editorStore.markSaved` 会同步更新
   * `content` / `lastSavedContent` / `dirty` / `lastExternalModified`，
   * VditorEditor 端通过 `watch(value)` 自动调 `vditor.setValue(newContent, true)`
   * 完成 UI 刷新。同时把 baseline 推进到本次读盘拿到的 mtime，避免下一次
   * poll 把「我们刚读到的文件」再判为外部修改。
   *
   * @param {FileSystemFileHandle} handle
   */
  async function reloadFromHandle(handle) {
    const file = await handle.getFile();
    const content = await file.text();
    editorStore.markSaved({ content, lastModified: file.lastModified });
  }

  /**
   * 立即检查一次外部元信息。
   * - 已被另一轮 checkNow 占用 → 跳过（不会引发并发 IO）
   * - handle 为 null → 跳过
   * - 错误 → 静默 + console.debug（M8 接手）
   */
  async function checkNow() {
    if (checking) return;
    const handle = handleRef.value;
    if (!handle) return;
    checking = true;
    try {
      const metadata = await fileSystem.getMetadata(handle);

      // baseline 由 store 维护。null 时（兜底：loadFromFile / markSaved
      // 漏传 lastModified）按当前盘面建立基线，不触发任何动作。
      if (editorStore.lastExternalModified === null) {
        editorStore.lastExternalModified = metadata.lastModified;
        return;
      }
      // 无变化
      if (metadata.lastModified === editorStore.lastExternalModified) return;

      // 有变化 → 推进 baseline
      editorStore.lastExternalModified = metadata.lastModified;

      // pending 状态下不再弹窗（§9 #13），由下次保存触发二次确认
      if (editorStore.externalState === 'pending') return;

      // 变化 + dirty=false → 静默自动重载
      if (!editorStore.dirty) {
        try {
          await reloadFromHandle(handle);
        } catch (err) {
          console.warn('[useExternalWatcher] auto reload failed:', err);
        }
        return;
      }

      // 变化 + dirty=true + clean → 弹 ExternalChangeDialog
      showDialog.value = true;
    } catch (err) {
      // M7 §4.2：getMetadata 抛错静默；M8 将接管 NotFound / Security 等
      console.debug('[useExternalWatcher] checkNow error (M8 to handle):', err);
    } finally {
      checking = false;
    }
  }

  /**
   * 启动轮询。幂等：重复调用不会叠加 setInterval。
   * 必须在 `externalWatchEnabled === true` 时调用，否则仅做 baseline 建立。
   */
  function startWatch() {
    if (intervalId !== null) return; // 幂等
    // baseline 由 useEditorStore 维护（loadFromFile / markSaved 写入），
    // watcher 不主动重置；checkNow 内已对 null 情况做了兜底——首轮 poll
    // 自然读到盘面 mtime 并落地，避免漏传 lastModified 的路径失效。
    // 立即检查一次（baseline 兜底 + 检测 mount 之后是否有变化）
    void checkNow();
    // 定时轮询（注意：始终注册 interval，但其内部 tick 通过 checking 守卫 + 设置开关避免抖腾）
    intervalId = setInterval(
      () => {
        void checkNow();
      },
      Math.max(1, settingsStore.externalWatchInterval) * 1000,
    );
  }

  /**
   * 停止轮询。幂等。
   */
  function stopWatch() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    // 不动 baseline —— baseline 由 useEditorStore 统一维护（loadFromFile /
    // markSaved），stopWatch 只负责停 IO；下次 startWatch 通过 checkNow 自然落基线。
  }

  /**
   * 处理 ExternalChangeDialog 的三选项回调：
   * - 'reload' → 读外部内容 + 清 dirty + externalState = 'clean'
   * - 'keep' / 'later' → externalState = 'pending'（不重载，让用户保留本地编辑）
   *   · 'keep' 与 'later' 在系统层面行为一致（详见 useExternalWatcher 注释
   *     「状态机」段）；UI 标签上区分表达用户意图。
   * - 注意：dialog 关闭与状态写入独立——先关 UI 再更新 store，避免用户在
   *   loading 中误以为未响应。
   */
  async function handleDialogResolve(choice) {
    showDialog.value = false;
    const handle = handleRef.value;
    if (!handle) return;

    if (choice === 'reload') {
      try {
        await reloadFromHandle(handle);
        editorStore.setExternalState('clean');
      } catch (err) {
        console.warn('[useExternalWatcher] reload failed:', err);
      }
      return;
    }
    if (choice === 'keep' || choice === 'later') {
      editorStore.setExternalState('pending');
    }
  }

  // ────────── handleRef 变化监听 ──────────
  // 内部用 immediate:true 让「打开已有 handle 的文件」也能直接启动；
  // EditorView 不必手动调 startWatch。
  watch(
    () => handleRef.value,
    (newHandle, oldHandle) => {
      if (newHandle === oldHandle) return;
      stopWatch();
      // 新 handle 时清状态 + 启动；handle=null 时仅清状态（M8 会在
      // orphaned 处理后调用 setExternalState）。
      // 注意：handle 由有效句柄变成 null 时，把 baseline 也清掉，避免脏
      // 句柄的 mtime 数值飘到下一个文件上引起误判。
      if (newHandle) {
        editorStore.setExternalState('clean');
        // 仅在开关打开时启动 interval；否则仅建立 baseline 一次
        if (settingsStore.externalWatchEnabled) startWatch();
      } else {
        editorStore.setExternalState('clean');
        editorStore.lastExternalModified = null;
      }
    },
    { immediate: true },
  );

  // ────────── 设置项变化监听 ──────────
  // 关 → 开 / 开 → 关 / interval 变更 → 重启轮询
  watch(
    () => [settingsStore.externalWatchEnabled, settingsStore.externalWatchInterval],
    ([enabled]) => {
      const handle = handleRef.value;
      if (!handle) return;
      stopWatch();
      if (enabled) startWatch();
    },
  );

  // ────────── window.focus 监听 ──────────
  // 即使 interval 周期未到，切回 tab 也立即检查一次（F-EM-11）
  function focusHandler() {
    if (!settingsStore.externalWatchEnabled) return;
    void checkNow();
  }
  window.addEventListener('focus', focusHandler);

  // ────────── 卸载清理 ──────────
  onBeforeUnmount(() => {
    stopWatch();
    window.removeEventListener('focus', focusHandler);
  });

  return {
    // 用 toRef 把 store 上的 externalState 暴露成可读 ref（同一份引用）
    externalState: toRef(editorStore, 'externalState'),
    showDialog,
    handleDialogResolve,
    startWatch,
    stopWatch,
    checkNow,
  };
}
