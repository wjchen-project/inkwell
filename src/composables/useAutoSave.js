import { ref, watch, onBeforeUnmount } from 'vue';
import { useMessage } from 'naive-ui';
import { useEditorStore } from '@/stores/useEditorStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useFileSystem } from '@/composables/useFileSystem';
import { useSaveOverride } from '@/composables/useSaveOverride';

/**
 * 自动保存 composable —— 设计文档 §6.2 / M3 §3.2 / M7 §3.4。
 *
 * 行为要点：
 * - 监听 `contentRef`（vditor input 事件同步到 `useEditorStore.content` 的 ref）；
 *   内容与 `lastSavedContent` 一致时不触发，避免回环（§4.1 内容回环检测）。
 * - 防抖时长 = `useSettingsStore.autoSaveInterval`（秒），由 `autoSave` 开关控制。
 * - 无句柄（新建未保存）首次触发 → 走 `saveAsFile`，弹出系统「另存为」对话框；
 *   有句柄 → 静默 `saveFile`。
 * - 写入失败 → toast + 指数退避重试（1s / 2s / 4s，最多 3 次）；
 *   三次全部失败 → toast「自动保存失败，请手动保存」，dirty 保持。
 * - 组件卸载 → 清防抖计时器；正在进行的 `triggerSave` 不取消，避免半保存状态。
 *
 * M7 新增：
 * - externalState === 'pending' 且 firstOverrideConfirmed === false → 写入前先调
 *   `useSaveOverride().ensureOverrideConfirmed()` 弹「外部已被修改，继续保存
 *   将覆盖外部内容？」用户确认后置 firstOverrideConfirmed=true，之后静默写入（§9 #10）。
 * - 用户在 override 弹窗选「取消」→ 早退，不写入；isSaving 清零；dirty 保持。
 * - 仅在重试循环开始前弹一次（首次尝试），失败重试不再询问（用户已经知道在覆盖外部）。
 *
 * 调用约束：
 * - 必须在组件 `setup()` 中调用，以让 `useMessage()` 拿到上层 `NMessageProvider`。
 * - `contentRef` 通常直接传 `useEditorStore().content` 的 ref 视图；
 *   也可传一个独立的 ref（但 store 仍是 dirty / lastSavedContent 的真理之源）。
 *
 * @param {import('vue').Ref<string>} contentRef 编辑器当前内容 ref
 * @param {{ onFirstSave?: () => void }} [options]
 * @returns {{
 *   isSaving: import('vue').Ref<boolean>,
 *   lastError: import('vue').Ref<Error | null>,
 *   retryCount: import('vue').Ref<number>,
 *   triggerSave: () => Promise<void>,
 *   cancelPending: () => void,
 * }}
 */
export function useAutoSave(contentRef, options = {}) {
  const editorStore = useEditorStore();
  const settingsStore = useSettingsStore();
  const fileSystem = useFileSystem();
  const message = useMessage();
  const { ensureOverrideConfirmed } = useSaveOverride();

  const isSaving = ref(false);
  const lastError = ref(/** @type {Error | null} */ (null));
  const retryCount = ref(0);

  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  /** 防抖 / 重试过程中若再次触发，重置「重试尝试」计数 */
  let generation = 0;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleTimer() {
    clearTimer();
    const intervalSec = settingsStore.autoSaveInterval;
    const intervalMs = Math.max(1, intervalSec) * 1000;
    timer = setTimeout(() => {
      timer = null;
      // fire-and-forget：triggerSave 自身处理 isSaving / 错误
      triggerSave();
    }, intervalMs);
  }

  /**
   * 主动取消尚未触发的防抖（不中断正在进行的写入）。
   * 暴露给调用方用于「编辑器卸载前 / 路由切换」等场景。
   */
  function cancelPending() {
    clearTimer();
  }

  /**
   * 指数退避延迟（ms）：1s / 2s / 4s。固定值，与重试次序一一对应。
   *
   * @param {number} attempt 0-based 重试次序（0 表示第 1 次重试）
   */
  function backoffDelayMs(attempt) {
    const delays = [1000, 2000, 4000];
    return delays[Math.min(attempt, delays.length - 1)];
  }

  /**
   * 睡眠 N ms。返回一个在新一次 generation 下会被忽略的 Promise。
   *
   * 之所以包一层 generation：退避 sleep 期间若用户再次触发保存，
   * 旧 sleep 必须能被打断（防止陈旧重试覆盖新的写入）。
   */
  function interruptibleSleep(ms, myGen) {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        if (myGen === generation) resolve();
        else resolve();
      }, ms);
      // 不暴露 cancel 接口：generation 变化即视为打断
      void t;
    });
  }

  /**
   * 手动触发一次保存（绕过防抖）。
   * 由 composable 内部防抖计时器回调调用，也可由外部按钮直接触发。
   */
  async function triggerSave() {
    // 防御：保存期间再次触发 → 直接吞掉（避免嵌套写）。
    // useFileSystem.saveFile 是顺序调用，串行化是更稳的策略。
    if (isSaving.value) return;

    isSaving.value = true;
    lastError.value = null;
    retryCount.value = 0;

    const contentSnapshot = contentRef.value;
    const myGen = ++generation;

    try {
      const handle = editorStore.fileHandle;
      if (!handle) {
        // 首次保存：自动走「另存为」流程
        const result = await fileSystem.saveAsFile(contentSnapshot, editorStore.fileName);
        if (myGen !== generation) return; // 期间状态变化，本轮放弃
        if (result) {
          editorStore.updateFileHandle({ handle: result.handle, name: result.name });
          // 透传 lastModified：markSaved 同步 baseline，避免之后外部修改检测
          // 把「我们自己刚写的 mtime」误判为外部修改。
          editorStore.markSaved({
            content: contentSnapshot,
            lastModified: result.lastModified,
          });
          options.onFirstSave?.();
        }
        // 用户取消（AbortError → null）：保留 dirty，无 toast
        return;
      }

      // 有句柄：静默写入；失败走指数退避
      // 权限处理：首次调用走 saveFileWithPermission，遇到权限错误时自动请求写权限。
      // 授权后重试仍失败 → 跳出退避循环，给出明确提示（不要骚扰用户重复弹权限框）。
      // toast 策略说明：useFileSystem.saveFile 本身在业务错误上会 toast（如
      // 「保存失败：文件权限已被撤销」），表达原因与当前状态；useAutoSave 不再
      // 中间插 toast，避免一轮重试出现 6 条 toast 刷屏。

      // M7：pending 状态下写入前先弹二次确认。仅问一次，确认后置
      // firstOverrideConfirmed=true，重试循环里不再询问（用户已经知道在覆盖外部）。
      const confirmed = await ensureOverrideConfirmed();
      if (!confirmed) {
        // 用户取消覆盖外部 → 不写、不 dirty、不动 generation
        return;
      }

      const MAX_ATTEMPTS = 3;
      let permissionDenied = false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        if (myGen !== generation) return; // 期间被打断
        retryCount.value = attempt;
        // 首次尝试走 saveFileWithPermission（包含权限请求）；后续退避重试保持 saveFile，
        // 避免重复弹权限框打扰用户。权限被拒后用 permissionDenied 直接跳出。
        const result =
          attempt === 0
            ? await fileSystem.saveFileWithPermission(handle, contentSnapshot)
            : await fileSystem.saveFile(handle, contentSnapshot);
        if (myGen !== generation) return;
        if (result.ok) {
          // 透传 lastModified：markSaved 同步 baseline（外部修改检测使用）。
          editorStore.markSaved({
            content: contentSnapshot,
            lastModified: result.lastModified ?? undefined,
          });
          retryCount.value = 0;
          return;
        }
        // 权限被拒：跳出退避（重复退避只会反复失权，不再可能成功）
        if (result.permissionRequested && !result.permissionGranted) {
          permissionDenied = true;
          break;
        }
        if (attempt < MAX_ATTEMPTS - 1) {
          await interruptibleSleep(backoffDelayMs(attempt), myGen);
          if (myGen !== generation) return;
        }
      }
      // 汇总提示：权限被拒 vs 其他错误文案不同
      if (permissionDenied) {
        message.error('自动保存失败：未授予写入权限，请点击编辑器「保存」按钮重新授权');
      } else {
        message.error('自动保存失败，请手动保存');
      }
    } catch (err) {
      lastError.value = err instanceof Error ? err : new Error(String(err));
      // 业务异常（useFileSystem 已 toast）此处仅落 lastError
      console.warn('[useAutoSave] unexpected error:', err);
    } finally {
      if (myGen === generation) {
        isSaving.value = false;
        retryCount.value = 0;
      }
    }
  }

  // ────────── 监听 contentRef：内容变更触发防抖 ──────────
  watch(
    contentRef,
    (next) => {
      if (!settingsStore.autoSave) return;
      if (next === editorStore.lastSavedContent) return;
      scheduleTimer();
    },
    { flush: 'post' },
  );

  // ────────── 监听 autoSaveInterval / autoSave：设置变化时重排计时器 ──────────
  // 关闭自动保存 → 取消所有未触发的防抖；打开或调整间隔 → 重排（仅当有未保存内容时）
  watch(
    () => [settingsStore.autoSave, settingsStore.autoSaveInterval],
    ([enabled], [prevEnabled]) => {
      if (!enabled) {
        clearTimer();
        return;
      }
      if (!prevEnabled) {
        // 关闭 → 打开：仅在有未保存内容时重启
        if (contentRef.value !== editorStore.lastSavedContent) {
          scheduleTimer();
        }
      }
      // 间隔调整：让下次自然到期按新时长计算；若当前已有 pending 计时器，
      // 则不再主动重排——大多数间隔调整在 setting drawer 内完成，5s 内到期属合理 UX。
    },
  );

  // ────────── 组件卸载清理 ──────────
  // 不取消正在进行的 isSaving，避免半保存状态。
  onBeforeUnmount(() => {
    clearTimer();
  });

  return {
    isSaving,
    lastError,
    retryCount,
    triggerSave,
    cancelPending,
  };
}
