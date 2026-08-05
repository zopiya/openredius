import { useEffect } from 'react';

/** 与原型每页 <title> 保持一致:页面名 · 准入认证控制台 */
export function useTitle(page?: string) {
  useEffect(() => {
    document.title = page ? `${page} · 准入认证控制台` : '准入认证控制台 · 页面导航';
  }, [page]);
}
