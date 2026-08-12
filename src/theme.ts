import type { ThemeConfig } from 'antd';

/**
 * Ant Design 6 主题配置
 * 回归 antd 默认设计语言（默认主色 #1677ff、默认灰阶、默认圆角/字体）。
 * 仅保留深色侧边栏（ProLayout 经典风格）所需的最小显式配置。
 */
const theme: ThemeConfig = {
  components: {
    Layout: {
      siderBg: '#001529',
    },
    Menu: {
      // 深色菜单选中态 = 主色高亮（Pro 风格；antd 默认即 colorPrimary，此处显式声明决策）
      darkItemSelectedBg: '#1677ff',
      darkItemSelectedColor: '#ffffff',
      darkItemColor: 'rgba(255, 255, 255, 0.65)',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.08)',
    },
  },
};

export default theme;
