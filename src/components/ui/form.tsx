import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** 控件基类(原型 .inp/.sel):30px 高、7px 圆角、聚焦 accent 描边 + 光环 */
const CONTROL =
  'h-[30px] min-w-[126px] rounded-[7px] border border-line bg-bg px-2.5 text-[13px] text-fg transition-[border-color,box-shadow] duration-150 focus:border-accent focus:shadow-focus focus:outline-none group-data-[invalid]:border-danger group-data-[invalid]:shadow-[0_0_0_1px_var(--color-danger)]';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input data-slot="input" className={cn(CONTROL, 'placeholder:text-meta', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select data-slot="select" className={cn(CONTROL, 'cursor-pointer', className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-24 resize-y rounded-[7px] border border-line bg-bg px-2.5 py-[9px] text-[13px] leading-normal text-fg transition-[border-color,box-shadow] duration-150 placeholder:text-meta focus:border-accent focus:shadow-focus focus:outline-none',
        className,
      )}
      {...rest}
    />
  );
}

/** 原生复选框(原型 accent-color: accent) */
export function Checkbox({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn('m-0 size-[15px] cursor-pointer accent-accent', className)}
      {...rest}
    />
  );
}

/** iOS 风格开关:保留原生 checkbox 语义(原型 .sw) */
export function Switch({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      data-slot="switch"
      className={cn(
        'relative h-[22px] w-9 shrink-0 cursor-pointer appearance-none rounded-pill bg-fg/20 transition-colors duration-150 checked:bg-accent',
        "after:absolute after:top-0.5 after:left-0.5 after:size-[18px] after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(0,0,0,0.22)] after:transition-transform after:duration-150 after:ease-standard after:content-['']",
        'checked:after:translate-x-3.5',
        className,
      )}
      {...rest}
    />
  );
}

export interface FieldProps {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  invalid?: boolean;
  className?: string;
  children: ReactNode;
}

/** 表单字段容器(原型 .field):invalid 时下级控件红框、错误文案显示 */
export function Field({ label, htmlFor, required, hint, error, invalid, className, children }: FieldProps) {
  return (
    <div
      data-slot="field"
      {...(invalid ? { 'data-invalid': '' } : {})}
      className={cn('group flex min-w-0 flex-col gap-1.5', className)}
    >
      {label && (
        <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-fg-2">
          {label}
          {required && <span className="ml-0.5 font-semibold text-danger">*</span>}
        </label>
      )}
      {children}
      {hint && <span className="text-[11.5px] text-meta">{hint}</span>}
      {error && (
        <span data-slot="field-error" className="hidden text-xs text-danger group-data-[invalid]:block">
          {error}
        </span>
      )}
    </div>
  );
}

/** 筛选区(原型 .filters) */
export function FilterBar({ advanced, testId, className, children }: { advanced?: boolean; testId?: string; className?: string; children: ReactNode }) {
  return (
    <div
      data-slot="filters"
      data-testid={testId}
      className={cn(
        'flex flex-wrap items-end gap-3 px-5 py-3.5',
        advanced ? 'border-t border-dashed border-line bg-surface-warm' : 'border-b border-line-soft',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FilterItem({ label, htmlFor, children }: { label?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[5px]">
      {label && (
        <label htmlFor={htmlFor} className="text-[11.5px] text-muted">
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

export function FilterSpacer() {
  return <div className="flex-1" />;
}

/** 复选行(原型 .check),small 说明文案自动弱化 */
export function CheckItem({ center, className, children }: { center?: boolean; className?: string; children: ReactNode }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer gap-[9px] text-[13.5px] text-fg [&_small]:mt-px [&_small]:block [&_small]:text-[11.5px] [&_small]:text-muted',
        center ? 'items-center' : 'items-start',
        className,
      )}
    >
      {children}
    </label>
  );
}

/** 单选卡片(原型 .radio-card) */
export function RadioCard({
  on,
  value,
  title,
  desc,
  onClick,
}: {
  on: boolean;
  value?: string;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <div
      data-slot="radio-card"
      data-state={on ? 'on' : 'off'}
      data-v={value}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-[10px] border px-3 py-[11px] text-[13px] transition-[border-color,box-shadow] duration-150',
        on ? 'border-accent shadow-[0_0_0_1px_var(--color-accent)]' : 'border-line',
      )}
    >
      <b className="block text-[13px] font-semibold">{title}</b>
      <small className="text-[11.5px] text-muted">{desc}</small>
    </div>
  );
}
