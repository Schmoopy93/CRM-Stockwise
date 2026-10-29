"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import styles from "./select.module.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  placeholder?: string;
  showChevron?: boolean;
  /** For triggers already framed by an icon wrapper (sort pills, filter bars). */
  bare?: boolean;
  required?: boolean;
}

interface MenuPosition {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
  dropUp: boolean;
}

const MENU_GAP = 6;
const VIEWPORT_MARGIN = 8;
const MENU_MAX_HEIGHT = 288;
const TYPEAHEAD_RESET = 600;

/** A button trigger plus an option list rendered into a portal.
 *
 * Native selects hand the popup to the OS/browser, so its surface cannot be
 * themed — Chrome paints it white on the dark theme. This keeps the list on
 * our own tokens, and escaping to the body means a scrollable card or a
 * `.fade-up` transform cannot clip it. */
export default function Select({
  value,
  onChange,
  options,
  id,
  ariaLabel,
  ariaLabelledBy,
  className,
  style,
  disabled,
  placeholder,
  showChevron = true,
  bare,
  required,
}: SelectProps) {
  const reactId = useId();
  const menuId = `${reactId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef<{ buffer: string; timer: ReturnType<typeof setTimeout> | null }>({ buffer: "", timer: null });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const selected = options.find((option) => option.value === value);
  const display = selected?.label ?? placeholder ?? "";

  const firstEnabled = useCallback(() => options.findIndex((option) => !option.disabled), [options]);
  const lastEnabled = useCallback(() => {
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (!options[index].disabled) return index;
    }
    return -1;
  }, [options]);

  const measure = useCallback((): MenuPosition => {
    const rect = triggerRef.current!.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 200), window.innerWidth - VIEWPORT_MARGIN * 2);
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - MENU_GAP - VIEWPORT_MARGIN;
    const dropUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(MENU_MAX_HEIGHT, dropUp ? spaceAbove : spaceBelow));
    const left = Math.min(Math.max(rect.left, VIEWPORT_MARGIN), window.innerWidth - width - VIEWPORT_MARGIN);
    return dropUp
      ? { left: Math.round(left), width: Math.round(width), maxHeight, bottom: Math.round(window.innerHeight - rect.top + MENU_GAP), dropUp }
      : { left: Math.round(left), width: Math.round(width), maxHeight, top: Math.round(rect.bottom + MENU_GAP), dropUp };
  }, []);

  const openMenu = useCallback((start: "selected" | "first" | "last" = "selected") => {
    if (disabled || !triggerRef.current) return;
    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
    const initial = start === "last" ? lastEnabled() : start === "first" ? firstEnabled() : selectedIndex >= 0 ? selectedIndex : firstEnabled();
    setActiveIndex(initial);
    setPosition(measure());
    setOpen(true);
  }, [disabled, options, value, lastEnabled, firstEnabled, measure]);

  const closeMenu = useCallback(() => setOpen(false), []);

  const commit = useCallback((index: number) => {
    const option = options[index];
    setOpen(false);
    if (option && !option.disabled && option.value !== value) onChange(option.value);
  }, [options, value, onChange]);

  const move = useCallback((step: 1 | -1) => {
    if (options.length === 0) return;
    let index = activeIndex;
    for (let count = 0; count < options.length; count += 1) {
      index = (index + step + options.length) % options.length;
      if (!options[index].disabled) {
        setActiveIndex(index);
        return;
      }
    }
  }, [activeIndex, options]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${reactId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, reactId]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
        setOpen(false);
        return;
      }
      setPosition(measure());
    };
    const onScroll = (event: Event) => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) return;
      reposition();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, measure]);

  useEffect(() => () => {
    if (typeahead.current.timer) clearTimeout(typeahead.current.timer);
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMenu(event.key === "ArrowUp" ? "last" : "selected");
      }
      return;
    }
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        closeMenu();
        break;
      case "Tab":
        closeMenu();
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        commit(activeIndex);
        break;
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Home": {
        event.preventDefault();
        const first = firstEnabled();
        if (first >= 0) setActiveIndex(first);
        break;
      }
      case "End": {
        event.preventDefault();
        const last = lastEnabled();
        if (last >= 0) setActiveIndex(last);
        break;
      }
      default: {
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
        const state = typeahead.current;
        if (state.timer) clearTimeout(state.timer);
        state.buffer += event.key.toLocaleLowerCase();
        state.timer = setTimeout(() => { state.buffer = ""; state.timer = null; }, TYPEAHEAD_RESET);
        const match = options.findIndex((option) => !option.disabled && option.label.toLocaleLowerCase().startsWith(state.buffer));
        if (match >= 0) setActiveIndex(match);
      }
    }
  }

  const triggerClassName = [styles.trigger, className ?? ""].filter(Boolean).join(" ");

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${reactId}-option-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-required={required || undefined}
        disabled={disabled}
        className={triggerClassName}
        style={style}
        data-bare={bare || undefined}
        data-open={open || undefined}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
      >
        <span className={styles.value} data-placeholder={selected ? undefined : true}>
          {display || "\u00a0"}
        </span>
        {showChevron && <ChevronDown size={14} className={styles.chevron} aria-hidden="true" />}
      </button>

      {required && (
        <select
          className={styles.validation}
          value={value}
          required
          tabIndex={-1}
          aria-hidden="true"
          onChange={() => {}}
        >
          <option value="" />
          {options.map((option, index) => (
            <option key={`${option.value}-${index}`} value={option.value} />
          ))}
        </select>
      )}

      {open && position && typeof document !== "undefined" && createPortal(
        <ul
          ref={menuRef}
          id={menuId}
          role="listbox"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className={styles.menu}
          data-drop-up={position.dropUp || undefined}
          style={{
            left: position.left,
            width: position.width,
            maxHeight: position.maxHeight,
            top: position.top,
            bottom: position.bottom,
          }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {options.length === 0 ? (
            <li className={styles.emptyRow} role="presentation">{placeholder}</li>
          ) : (
            options.map((option, index) => (
              <li
                key={`${option.value}-${index}`}
                id={`${reactId}-option-${index}`}
                role="option"
                data-value={option.value}
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                data-active={index === activeIndex || undefined}
                data-selected={option.value === value || undefined}
                data-disabled={option.disabled || undefined}
                className={styles.option}
                onMouseEnter={() => { if (!option.disabled) setActiveIndex(index); }}
                onClick={() => commit(index)}
              >
                <span className={styles.optionLabel}>{option.label}</span>
                {option.value === value && <Check size={13} className={styles.check} aria-hidden="true" />}
              </li>
            ))
          )}
        </ul>,
        document.body
      )}
    </>
  );
}
