/**
 * 仪表盘键盘快捷键。
 *
 * 架构位置：dashboard 页面只负责提供搜索框 ref 和「新增订阅」回调，
 * 键位判断、输入框/弹层保护集中在这里，避免页面继续膨胀。
 *
 * 键位：
 * - `/` 或 Ctrl/Cmd+K：聚焦订阅搜索框
 * - `n`：打开新增订阅弹窗
 *
 * Caveat: 在输入框内或已有弹层打开时不劫持按键，避免把正常输入吞掉。
 */
import { useEffect } from "react";
import type { RefObject } from "react";

interface DashboardShortcutsOptions {
  searchInputRef: RefObject<HTMLInputElement | null>;
  onNewSubscription: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function isOverlayOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]') !== null;
}

export function useDashboardShortcuts({
  searchInputRef,
  onNewSubscription,
}: DashboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.isComposing) return;
      const modifier = event.metaKey || event.ctrlKey;

      // Ctrl/Cmd+K 是通用「搜索」手势，在别的输入框里也生效。
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (modifier || isTypingTarget(event.target) || isOverlayOpen()) return;

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        onNewSubscription();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNewSubscription, searchInputRef]);
}
