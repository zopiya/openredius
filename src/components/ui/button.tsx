import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'outline' | 'danger' | 'danger-solid';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-accent text-white hover:bg-accent-hover active:bg-accent-active',
  outline: 'border-line bg-bg text-fg hover:bg-surface',
  danger:
    'border-[color-mix(in_oklab,var(--color-danger)_38%,#fff)] bg-bg text-danger hover:bg-[color-mix(in_oklab,var(--color-danger)_6%,#fff)]',
  'danger-solid':
    'border-transparent bg-danger text-white hover:bg-[color-mix(in_oklab,var(--color-danger)_88%,#000)]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
}

/** 标准按钮(原型 .btn 的组件化) */
export function Button({ variant = 'outline', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      data-slot="button"
      data-variant={variant}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm border font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-150 ease-standard disabled:pointer-events-none disabled:opacity-45',
        size === 'md' ? 'h-8 px-3.5 text-[13px]' : 'h-[27px] rounded-[7px] px-2.5 text-xs',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  );
}
